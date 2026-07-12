"""llm.py — LLM generation layer for the RAG pipeline."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AsyncOpenAI,
    AsyncStream,
    RateLimitError,
)
from openai.types.chat import ChatCompletionChunk

from app.core.config import settings
from app.core.logging import get_logger
from app.prompts.templates import build_messages, prepare_prompt_context
from app.services.retriever import RetrievedChunk

logger = get_logger(__name__)

DEFAULT_CHAT_MODEL = "gpt-4o-mini"
CHAT_TEMPERATURE = 0.2
MAX_TOKENS = 1000
MAX_RETRIES = 2
RETRY_BASE_DELAY_SECONDS = 1.0


class LLMError(Exception):
    """Raised when LLM generation fails."""


@dataclass(frozen=True)
class LLMCitation:
    """Citation metadata for a generated answer."""

    doc_id: str
    filename: str
    chunk_index: int
    chunk_id: str


@dataclass(frozen=True)
class GeneratedResponse:
    """A completed LLM response with citations."""

    answer: str
    citations: list[LLMCitation]


class LLMProvider(Protocol):
    """Interface for swappable LLM backends."""

    async def stream_answer(
        self,
        query: str,
        context: list[RetrievedChunk],
    ) -> AsyncIterator[str]:
        """Stream answer tokens for a user query."""
        ...


def _user_facing_error_message(exc: Exception) -> str:
    """Return a safe error message without exposing raw provider details."""
    if isinstance(exc, RateLimitError):
        return "The language model service is temporarily rate limited. Please try again."
    if isinstance(exc, APITimeoutError):
        return "The language model request timed out. Please try again."
    if isinstance(exc, APIConnectionError):
        return "Could not connect to the language model service. Please try again."
    if isinstance(exc, APIError):
        return "The language model service returned an error. Please try again."
    return "Answer generation failed. Please try again."


def build_citations(chunks: list[RetrievedChunk]) -> list[LLMCitation]:
    """Build citation metadata from retrieved chunks."""
    seen: set[str] = set()
    citations: list[LLMCitation] = []

    for chunk in chunks:
        if chunk.id in seen:
            continue
        seen.add(chunk.id)
        citations.append(
            LLMCitation(
                doc_id=chunk.metadata.doc_id,
                filename=chunk.metadata.filename,
                chunk_index=chunk.metadata.chunk_index,
                chunk_id=chunk.id,
            )
        )

    return citations


async def _iter_stream_tokens(
    stream: AsyncStream[ChatCompletionChunk],
) -> AsyncIterator[str]:
    """Yield text tokens from an OpenAI streaming response."""
    try:
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as exc:
        logger.error("LLM stream interrupted during token delivery: %s", exc)
        raise LLMError(
            "Answer generation was interrupted. Please try again."
        ) from exc


class OpenAILLMService:
    """OpenAI chat completion backend."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float = CHAT_TEMPERATURE,
        max_tokens: int = MAX_TOKENS,
    ) -> None:
        self._model = model or settings.OPENAI_CHAT_MODEL or DEFAULT_CHAT_MODEL
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._client = AsyncOpenAI(api_key=api_key or settings.OPENAI_API_KEY)

    async def _create_stream_with_retry(
        self,
        messages: list[dict[str, str]],
    ) -> AsyncStream[ChatCompletionChunk]:
        """Open a streaming chat completion with retry handling."""
        last_exc: Exception | None = None
        total_attempts = MAX_RETRIES + 1

        for attempt in range(total_attempts):
            try:
                return await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    temperature=self._temperature,
                    max_tokens=self._max_tokens,
                    stream=True,
                )
            except (RateLimitError, APITimeoutError, APIConnectionError, APIError) as exc:
                last_exc = exc
                if attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY_SECONDS * (2**attempt)
                    logger.warning(
                        "Transient LLM error on attempt %d/%d, retrying in %.1fs: %s",
                        attempt + 1,
                        total_attempts,
                        delay,
                        exc,
                    )
                    await asyncio.sleep(delay)
                    continue

                logger.error(
                    "LLM stream creation failed after %d attempts: %s",
                    total_attempts,
                    exc,
                )
                raise LLMError(_user_facing_error_message(exc)) from exc
            except Exception as exc:
                logger.exception("Unexpected LLM failure during stream creation")
                raise LLMError(_user_facing_error_message(exc)) from exc

        raise LLMError(_user_facing_error_message(last_exc)) from last_exc

    async def stream_answer(
        self,
        query: str,
        context: list[RetrievedChunk],
    ) -> AsyncIterator[str]:
        """Stream an answer for a user query using retrieved context.

        Args:
            query: The user's natural-language question.
            context: Retrieved chunks from retriever.py.

        Yields:
            Answer text tokens suitable for FastAPI StreamingResponse.

        Raises:
            LLMError: If generation fails before or during streaming.
        """
        stripped_query = query.strip()
        if not stripped_query:
            raise LLMError("Query must not be empty.")

        messages = build_messages(stripped_query, context)
        included_chunks, context_block = prepare_prompt_context(context)
        context_chars = len(context_block)

        logger.info(
            "Preparing LLM stream (model=%s, chunks=%d, included_chunks=%d, context_chars=%d, temperature=%.1f, max_tokens=%d)",
            self._model,
            len(context),
            len(included_chunks),
            context_chars,
            self._temperature,
            self._max_tokens,
        )

        streaming_started = False

        try:
            stream = await self._create_stream_with_retry(messages)
            logger.info("LLM token streaming started (model=%s)", self._model)

            async for token in _iter_stream_tokens(stream):
                streaming_started = True
                yield token
        except LLMError:
            if streaming_started:
                logger.error(
                    "LLM streaming failed after tokens were already sent (model=%s)",
                    self._model,
                )
            raise
        except Exception as exc:
            logger.error(
                "LLM streaming failed (model=%s, streaming_started=%s): %s",
                self._model,
                streaming_started,
                exc,
            )
            raise LLMError(_user_facing_error_message(exc)) from exc

        logger.info("LLM token streaming completed (model=%s)", self._model)


async def collect_streamed_answer(
    service: LLMProvider,
    query: str,
    context: list[RetrievedChunk],
) -> GeneratedResponse:
    """Collect a streamed answer into a complete response with citations."""
    included_chunks, _ = prepare_prompt_context(context)
    parts: list[str] = []

    async for token in service.stream_answer(query, context):
        parts.append(token)

    return GeneratedResponse(
        answer="".join(parts),
        citations=build_citations(included_chunks),
    )


def create_llm_service(
    api_key: str | None = None,
    model: str | None = None,
    temperature: float = CHAT_TEMPERATURE,
    max_tokens: int = MAX_TOKENS,
) -> OpenAILLMService:
    """Create an OpenAI LLM service instance."""
    return OpenAILLMService(
        api_key=api_key,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
