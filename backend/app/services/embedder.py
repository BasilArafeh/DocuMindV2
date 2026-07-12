"""embedder.py — Convert document chunks into vector embeddings."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AsyncOpenAI,
    RateLimitError,
)

from app.core.config import settings
from app.core.logging import get_logger
from app.services.chunker import TextChunk

logger = get_logger(__name__)

DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536
EMBEDDING_BATCH_SIZE = 100
MAX_RETRIES = 2
RETRY_BASE_DELAY_SECONDS = 1.0


class EmbeddingError(Exception):
    """Raised when embedding generation fails."""


@dataclass(frozen=True)
class EmbeddedChunk:
    """A chunk paired with its embedding vector."""

    chunk_index: int
    text: str
    embedding: list[float]


class EmbeddingProvider(Protocol):
    """Interface for swappable embedding backends."""

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts and return vectors in the same order."""
        ...


def _batch_texts(texts: list[str], batch_size: int) -> list[list[str]]:
    """Split texts into fixed-size batches."""
    return [texts[index : index + batch_size] for index in range(0, len(texts), batch_size)]


def _validate_vectors(vectors: list[list[float]]) -> None:
    """Ensure every embedding matches the expected model dimension."""
    for index, vector in enumerate(vectors):
        if len(vector) != EMBEDDING_DIMENSION:
            raise EmbeddingError(
                f"Unexpected embedding dimension at index {index}: "
                f"expected {EMBEDDING_DIMENSION}, got {len(vector)}."
            )


def _transient_error_message(exc: Exception) -> str:
    if isinstance(exc, RateLimitError):
        return "OpenAI rate limit exceeded."
    if isinstance(exc, APITimeoutError):
        return "OpenAI embedding request timed out."
    if isinstance(exc, APIConnectionError):
        return "Failed to connect to OpenAI API."
    if isinstance(exc, APIError):
        return f"OpenAI server error during embedding: {exc}"
    return "OpenAI embedding request failed."


class OpenAIEmbeddingProvider:
    """OpenAI embedding backend."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_EMBEDDING_MODEL,
        batch_size: int = EMBEDDING_BATCH_SIZE,
    ) -> None:
        self._model = model
        self._batch_size = batch_size
        self._client = AsyncOpenAI(api_key=api_key or settings.OPENAI_API_KEY)

    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Send one embedding request to OpenAI."""
        response = await self._client.embeddings.create(
            model=self._model,
            input=texts,
        )
        ordered = sorted(response.data, key=lambda item: item.index)
        return [item.embedding for item in ordered]

    async def _embed_batch_with_retry(self, texts: list[str]) -> list[list[float]]:
        """Retry transient OpenAI failures with exponential backoff."""
        last_exc: Exception | None = None
        total_attempts = MAX_RETRIES + 1

        for attempt in range(total_attempts):
            try:
                return await self._embed_batch(texts)
            except (RateLimitError, APITimeoutError, APIConnectionError, APIError) as exc:
                last_exc = exc
                if attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY_SECONDS * (2**attempt)
                    logger.warning(
                        "Transient embedding error on attempt %d/%d, retrying in %.1fs: %s",
                        attempt + 1,
                        total_attempts,
                        delay,
                        exc,
                    )
                    await asyncio.sleep(delay)
                    continue

                logger.error(
                    "Embedding failed after %d attempts: %s",
                    total_attempts,
                    exc,
                )
                raise EmbeddingError(_transient_error_message(exc)) from exc
            except Exception as exc:
                logger.exception("Unexpected embedding failure")
                raise EmbeddingError(f"Unexpected embedding failure: {exc}") from exc

        raise EmbeddingError(_transient_error_message(last_exc)) from last_exc

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts using OpenAI."""
        if not texts:
            return []

        logger.info(
            "Embedding %d texts with model %s in batches of %d",
            len(texts),
            self._model,
            self._batch_size,
        )

        vectors: list[list[float]] = []
        batches = _batch_texts(texts, self._batch_size)

        for batch_number, batch in enumerate(batches, start=1):
            logger.info(
                "Processing embedding batch %d/%d (%d texts)",
                batch_number,
                len(batches),
                len(batch),
            )
            batch_vectors = await self._embed_batch_with_retry(batch)
            _validate_vectors(batch_vectors)
            vectors.extend(batch_vectors)

        logger.info("Generated %d embeddings", len(vectors))
        return vectors


_default_provider: OpenAIEmbeddingProvider | None = None


def _get_default_provider() -> OpenAIEmbeddingProvider:
    global _default_provider
    if _default_provider is None:
        _default_provider = OpenAIEmbeddingProvider()
    return _default_provider


async def embed_chunks(
    chunks: list[TextChunk],
    provider: EmbeddingProvider | None = None,
) -> list[EmbeddedChunk]:
    """Convert document chunks into embedding vectors.

    Args:
        chunks: Text chunks from chunker.py.
        provider: Optional embedding backend. Defaults to OpenAI.

    Returns:
        Embedded chunks in the same order as the input chunks.

    Raises:
        EmbeddingError: If the embedding provider fails.
    """
    if not chunks:
        logger.warning("embed_chunks received empty chunk list")
        return []

    embedder = provider or _get_default_provider()
    texts = [chunk.text for chunk in chunks]

    try:
        vectors = await embedder.embed_texts(texts)
    except EmbeddingError:
        raise
    except Exception as exc:
        logger.exception("Embedding provider failed")
        raise EmbeddingError(f"Embedding provider failed: {exc}") from exc

    if len(vectors) != len(chunks):
        raise EmbeddingError(
            f"Embedding count mismatch: expected {len(chunks)}, got {len(vectors)}."
        )

    return [
        EmbeddedChunk(
            chunk_index=chunk.chunk_index,
            text=chunk.text,
            embedding=vector,
        )
        for chunk, vector in zip(chunks, vectors, strict=True)
    ]
