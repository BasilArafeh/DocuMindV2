"""suggest_router.py — Generate suggested questions from session document chunks."""

from __future__ import annotations

import asyncio
import json
import random
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.services.embedder import EMBEDDING_DIMENSION

logger = get_logger(__name__)

router = APIRouter(tags=["suggest"])

MAX_CONTEXT_CHARS = 1500
CHUNK_COUNT = 4
# Pinecone is eventually consistent; retry briefly after a fresh upsert.
FETCH_ATTEMPTS = 5
FETCH_RETRY_DELAY_SECONDS = 0.4


class SuggestQuestionsRequest(BaseModel):
    session_id: str
    doc_id: str | None = None


class SuggestQuestionsResponse(BaseModel):
    suggestions: list[str] = Field(default_factory=list)


def _empty() -> SuggestQuestionsResponse:
    return SuggestQuestionsResponse(suggestions=[])


def _build_filter(session_id: str, doc_id: str | None) -> dict[str, Any]:
    if doc_id:
        return {
            "$and": [
                {"session_id": {"$eq": session_id}},
                {"doc_id": {"$eq": doc_id}},
            ]
        }
    return {"session_id": {"$eq": session_id}}


def _fetch_random_chunks_sync(
    vector_store: Any,
    session_id: str,
    doc_id: str | None,
) -> list[str]:
    """Fetch a small random sample of chunk texts for the session via Pinecone."""
    index = vector_store._index
    namespace = vector_store._namespace
    query_vector = [random.random() for _ in range(EMBEDDING_DIMENSION)]

    response = index.query(
        vector=query_vector,
        top_k=CHUNK_COUNT,
        namespace=namespace,
        filter=_build_filter(session_id, doc_id),
        include_metadata=True,
        include_values=False,
    )

    texts: list[str] = []
    for match in response.matches or []:
        metadata = match.metadata or {}
        text = metadata.get("text")
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
    return texts


def _combine_context(chunks: list[str]) -> str:
    combined = "\n\n".join(chunks)
    if len(combined) > MAX_CONTEXT_CHARS:
        return combined[:MAX_CONTEXT_CHARS]
    return combined


def _parse_suggestions(content: str) -> list[str]:
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    parsed = json.loads(text)
    if not isinstance(parsed, list):
        return []

    suggestions = [
        item.strip()
        for item in parsed
        if isinstance(item, str) and item.strip()
    ]
    return suggestions[:3]


@router.post("/suggest-questions", response_model=SuggestQuestionsResponse)
async def suggest_questions(
    request: Request,
    body: SuggestQuestionsRequest,
) -> SuggestQuestionsResponse:
    """Return 3 suggested questions for a session's documents."""
    try:
        session_id = body.session_id.strip()
        if not session_id:
            return _empty()

        doc_id = body.doc_id.strip() if body.doc_id else None
        vector_store = request.app.state.vector_store
        llm_service = request.app.state.llm_service

        chunks: list[str] = []
        for attempt in range(1, FETCH_ATTEMPTS + 1):
            chunks = await asyncio.to_thread(
                _fetch_random_chunks_sync,
                vector_store,
                session_id,
                doc_id,
            )
            if chunks:
                break
            if attempt < FETCH_ATTEMPTS:
                logger.info(
                    "suggest-questions found 0 chunks session_id=%s attempt=%d/%d; retrying",
                    session_id,
                    attempt,
                    FETCH_ATTEMPTS,
                )
                await asyncio.sleep(FETCH_RETRY_DELAY_SECONDS)

        if not chunks:
            logger.warning(
                "suggest-questions found no chunks after %d attempts session_id=%s",
                FETCH_ATTEMPTS,
                session_id,
            )
            return _empty()

        context = _combine_context(chunks)
        system = (
            "You are a helpful assistant that generates questions a user "
            "might ask about a document."
        )
        user = (
            "Based on this document content, generate exactly 3 short, specific, "
            "interesting questions a user might want to ask. Return ONLY a JSON "
            "array of 3 strings. No explanation, no markdown, just the array.\n\n"
            f"Document content:\n{context}"
        )

        completion = await llm_service._client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=200,
            temperature=0.7,
        )
        content = completion.choices[0].message.content or ""
        return SuggestQuestionsResponse(suggestions=_parse_suggestions(content))
    except Exception:
        logger.exception("suggest-questions failed")
        return _empty()
