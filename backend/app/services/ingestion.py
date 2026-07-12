"""ingestion.py — Orchestrate the document ingestion workflow."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import UploadFile

from app.core.logging import get_logger
from app.services.chunker import TextChunk, chunk_text
from app.services.embedder import (
    EmbeddedChunk,
    EmbeddingError,
    EmbeddingProvider,
    embed_chunks,
)
from app.services.parser import DocumentParsingError, parse_file
from app.services.vector_store import VectorStoreError, VectorStoreProvider

logger = get_logger(__name__)


class IngestionError(Exception):
    """Raised when document ingestion fails."""

    def __init__(self, message: str, status_code: int = 500) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class IngestionResult:
    """Result of a completed document ingestion."""

    doc_id: str
    filename: str
    chunks_created: int
    vectors_stored: int
    characters_extracted: int
    file_size_bytes: int
    duration_ms: int


def _resolve_filename(file: UploadFile) -> str:
    """Return a safe filename for logging and storage metadata."""
    return file.filename or "unknown"


def _resolve_doc_id(doc_id: str | None) -> str:
    """Return a provided document ID or generate a new one."""
    return doc_id or uuid.uuid4().hex


def _stage_duration_ms(started_at: float) -> int:
    """Calculate elapsed stage duration in milliseconds."""
    return int((time.perf_counter() - started_at) * 1000)


async def _measure_file_size(file: UploadFile) -> int:
    """Measure upload size in bytes and reset the file pointer."""
    data = await file.read()
    await file.seek(0)
    return len(data)


async def _rollback_document(
    store: VectorStoreProvider,
    doc_id: str,
    filename: str,
) -> None:
    """Best-effort rollback for partially stored document vectors."""
    try:
        await store.delete_document(doc_id)
        logger.warning(
            "Rolled back vectors after storage failure filename=%s doc_id=%s",
            filename,
            doc_id,
        )
    except Exception as exc:
        logger.error(
            "Rollback failed after storage failure filename=%s doc_id=%s: %s",
            filename,
            doc_id,
            exc,
        )


async def ingest_document(
    file: UploadFile,
    vector_store: VectorStoreProvider,
    session_id: str,
    registry: dict,
    embedder: EmbeddingProvider | None = None,
    doc_id: str | None = None,
) -> IngestionResult:
    """Run the full ingestion pipeline for an uploaded document.

    Pipeline:
        parse -> chunk -> embed -> store

    Args:
        file: Uploaded document from the API layer.
        vector_store: Shared vector database backend from application lifecycle.
        session_id: Client session identifier for isolation.
        registry: In-memory document registry keyed by session ID.
        embedder: Optional embedding backend.
        doc_id: Optional document ID. Generated when omitted.

    Returns:
        Summary of the ingestion result.

    Raises:
        IngestionError: If any ingestion step fails.
    """
    started_at = time.perf_counter()
    resolved_doc_id = _resolve_doc_id(doc_id)
    filename = _resolve_filename(file)
    file_size_bytes = await _measure_file_size(file)

    logger.info(
        "Starting ingestion filename=%s doc_id=%s session_id=%s file_size_bytes=%d",
        filename,
        resolved_doc_id,
        session_id,
        file_size_bytes,
    )

    try:
        parse_started_at = time.perf_counter()
        text = await _parse_document(file, filename, resolved_doc_id)
        parse_duration_ms = _stage_duration_ms(parse_started_at)
        logger.info(
            "Ingestion stage completed stage=parsing filename=%s doc_id=%s duration_ms=%d",
            filename,
            resolved_doc_id,
            parse_duration_ms,
        )

        chunk_started_at = time.perf_counter()
        chunks = await _chunk_document(text, filename, resolved_doc_id)
        chunk_duration_ms = _stage_duration_ms(chunk_started_at)
        logger.info(
            "Ingestion stage completed stage=chunking filename=%s doc_id=%s duration_ms=%d",
            filename,
            resolved_doc_id,
            chunk_duration_ms,
        )

        embed_started_at = time.perf_counter()
        embeddings = await _embed_document(
            chunks,
            embedder,
            filename,
            resolved_doc_id,
        )
        embed_duration_ms = _stage_duration_ms(embed_started_at)
        logger.info(
            "Ingestion stage completed stage=embedding filename=%s doc_id=%s duration_ms=%d",
            filename,
            resolved_doc_id,
            embed_duration_ms,
        )

        store_started_at = time.perf_counter()
        vectors_stored = await _store_document(
            vector_store,
            resolved_doc_id,
            filename,
            embeddings,
            session_id,
        )
        store_duration_ms = _stage_duration_ms(store_started_at)
        logger.info(
            "Ingestion stage completed stage=storage filename=%s doc_id=%s duration_ms=%d",
            filename,
            resolved_doc_id,
            store_duration_ms,
        )
    except IngestionError:
        raise
    except Exception as exc:
        logger.exception(
            "Unexpected ingestion failure filename=%s doc_id=%s",
            filename,
            resolved_doc_id,
        )
        raise IngestionError(
            f"Document ingestion failed for '{filename}'."
        ) from exc

    registry.setdefault(session_id, []).append(
        {
            "doc_id": resolved_doc_id,
            "filename": filename,
            "chunk_count": len(chunks),
            "upload_time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
    )

    duration_ms = _stage_duration_ms(started_at)
    result = IngestionResult(
        doc_id=resolved_doc_id,
        filename=filename,
        chunks_created=len(chunks),
        vectors_stored=vectors_stored,
        characters_extracted=len(text),
        file_size_bytes=file_size_bytes,
        duration_ms=duration_ms,
    )

    logger.info(
        (
            "Completed ingestion filename=%s doc_id=%s chunks=%d vectors=%d "
            "characters_extracted=%d file_size_bytes=%d duration_ms=%d"
        ),
        filename,
        resolved_doc_id,
        result.chunks_created,
        result.vectors_stored,
        result.characters_extracted,
        result.file_size_bytes,
        result.duration_ms,
    )
    return result


async def _parse_document(file: UploadFile, filename: str, doc_id: str) -> str:
    """Extract clean text from the uploaded file."""
    try:
        text = await parse_file(file)
    except DocumentParsingError as exc:
        logger.error(
            "Parsing failed filename=%s doc_id=%s: %s",
            filename,
            doc_id,
            exc.message,
        )
        raise IngestionError(exc.message, status_code=exc.status_code) from exc

    logger.info(
        "Parsed document filename=%s doc_id=%s extracted_chars=%d",
        filename,
        doc_id,
        len(text),
    )
    return text


async def _chunk_document(text: str, filename: str, doc_id: str) -> list[TextChunk]:
    """Split document text into chunks."""
    chunks = await asyncio.to_thread(chunk_text, text)

    if not chunks:
        logger.error(
            "Chunking produced no chunks filename=%s doc_id=%s",
            filename,
            doc_id,
        )
        raise IngestionError(
            f"No chunks could be created from '{filename}'.",
            status_code=422,
        )

    logger.info(
        "Chunked document filename=%s doc_id=%s chunks_created=%d",
        filename,
        doc_id,
        len(chunks),
    )
    return chunks


async def _embed_document(
    chunks: list[TextChunk],
    embedder: EmbeddingProvider | None,
    filename: str,
    doc_id: str,
) -> list[EmbeddedChunk]:
    """Generate embeddings for document chunks."""
    try:
        embeddings = await embed_chunks(chunks, provider=embedder)
    except EmbeddingError as exc:
        logger.error(
            "Embedding failed filename=%s doc_id=%s: %s",
            filename,
            doc_id,
            exc,
        )
        raise IngestionError(
            f"Failed to generate embeddings for '{filename}'."
        ) from exc

    if len(embeddings) != len(chunks):
        logger.error(
            "Embedding count mismatch filename=%s doc_id=%s expected=%d got=%d",
            filename,
            doc_id,
            len(chunks),
            len(embeddings),
        )
        raise IngestionError(
            f"Embedding count mismatch for '{filename}'."
        )

    logger.info(
        "Embedded document filename=%s doc_id=%s embeddings_created=%d",
        filename,
        doc_id,
        len(embeddings),
    )
    return embeddings


async def _store_document(
    store: VectorStoreProvider,
    doc_id: str,
    filename: str,
    embeddings: list[EmbeddedChunk],
    session_id: str,
) -> int:
    """Store document embeddings in the vector database."""
    try:
        vectors_stored = await store.upsert_document(
            doc_id=doc_id,
            filename=filename,
            chunks=embeddings,
            session_id=session_id,
        )
    except VectorStoreError as exc:
        logger.error(
            "Vector storage failed filename=%s doc_id=%s: %s",
            filename,
            doc_id,
            exc,
        )
        await _rollback_document(store, doc_id, filename)
        raise IngestionError(
            f"Failed to store vectors for '{filename}'."
        ) from exc

    if vectors_stored == 0:
        logger.error(
            "Vector storage returned zero vectors filename=%s doc_id=%s",
            filename,
            doc_id,
        )
        await _rollback_document(store, doc_id, filename)
        raise IngestionError(
            f"No vectors were stored for '{filename}'."
        )

    logger.info(
        "Stored vectors filename=%s doc_id=%s vectors_stored=%d",
        filename,
        doc_id,
        vectors_stored,
    )
    return vectors_stored
