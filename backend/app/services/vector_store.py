"""vector_store.py — Vector database operations for the RAG pipeline."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Protocol

from pinecone import Pinecone

from app.core.config import settings
from app.core.logging import get_logger
from app.services.embedder import EmbeddedChunk

logger = get_logger(__name__)

UPSERT_BATCH_SIZE = 100
DEFAULT_TOP_K = 5


class VectorStoreError(Exception):
    """Raised when vector database operations fail."""


@dataclass(frozen=True)
class VectorMetadata:
    """Metadata stored alongside each vector."""

    doc_id: str
    filename: str
    chunk_index: int
    text: str
    session_id: str


@dataclass(frozen=True)
class VectorRecord:
    """A vector ready to be stored in the database."""

    id: str
    values: list[float]
    metadata: VectorMetadata


@dataclass(frozen=True)
class SearchResult:
    """A similarity search match for the retriever layer."""

    id: str
    score: float
    metadata: VectorMetadata


class VectorStoreProvider(Protocol):
    """Interface for swappable vector database backends."""

    async def upsert_document(
        self,
        doc_id: str,
        filename: str,
        chunks: list[EmbeddedChunk],
        session_id: str,
    ) -> int:
        """Store all embeddings for a document."""
        ...

    async def search(
        self,
        query_vector: list[float],
        session_id: str,
        top_k: int = DEFAULT_TOP_K,
    ) -> list[SearchResult]:
        """Find the most similar stored vectors."""
        ...

    async def delete_document(self, doc_id: str) -> None:
        """Remove all vectors belonging to a document."""
        ...


def build_vector_id(doc_id: str, chunk_index: int) -> str:
    """Build a stable vector ID for a document chunk."""
    return f"{doc_id}_{chunk_index}"


def _metadata_to_dict(metadata: VectorMetadata) -> dict[str, Any]:
    """Convert metadata to a Pinecone-compatible dictionary."""
    return {
        "doc_id": metadata.doc_id,
        "filename": metadata.filename,
        "chunk_index": metadata.chunk_index,
        "text": metadata.text,
        "session_id": metadata.session_id,
    }


def _parse_metadata(raw: dict[str, Any]) -> VectorMetadata:
    """Parse metadata returned from Pinecone."""
    return VectorMetadata(
        doc_id=str(raw["doc_id"]),
        filename=str(raw["filename"]),
        chunk_index=int(raw["chunk_index"]),
        text=str(raw["text"]),
        session_id=str(raw["session_id"]),
    )


def _build_doc_filter(session_id: str) -> dict[str, Any]:
    """Build a Pinecone metadata filter for a session."""
    return {"session_id": {"$eq": session_id}}


def _chunks_to_records(
    doc_id: str,
    filename: str,
    chunks: list[EmbeddedChunk],
    session_id: str,
) -> list[VectorRecord]:
    """Convert embedded chunks into vector records."""
    return [
        VectorRecord(
            id=build_vector_id(doc_id, chunk.chunk_index),
            values=chunk.embedding,
            metadata=VectorMetadata(
                doc_id=doc_id,
                filename=filename,
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                session_id=session_id,
            ),
        )
        for chunk in chunks
    ]


def _records_to_upsert_payload(records: list[VectorRecord]) -> list[dict[str, Any]]:
    """Convert vector records to Pinecone upsert payloads."""
    return [
        {
            "id": record.id,
            "values": record.values,
            "metadata": _metadata_to_dict(record.metadata),
        }
        for record in records
    ]


def _batch_records(
    records: list[VectorRecord],
    batch_size: int,
) -> list[list[VectorRecord]]:
    """Split vector records into fixed-size batches."""
    return [
        records[index : index + batch_size]
        for index in range(0, len(records), batch_size)
    ]


class PineconeVectorStore:
    """Pinecone-backed vector database adapter."""

    def __init__(
        self,
        api_key: str | None = None,
        index_name: str | None = None,
        namespace: str | None = None,
        upsert_batch_size: int = UPSERT_BATCH_SIZE,
    ) -> None:
        self._namespace = namespace if namespace is not None else settings.PINECONE_NAMESPACE
        self._upsert_batch_size = upsert_batch_size
        self._index_name = index_name or settings.PINECONE_INDEX_NAME

        if not self._index_name:
            raise VectorStoreError(
                "PINECONE_INDEX_NAME is not configured. Set it in your .env file."
            )

        try:
            client = Pinecone(api_key=api_key or settings.PINECONE_API_KEY)
            self._index = client.Index(name=self._index_name)
        except Exception as exc:
            logger.error("Failed to initialize Pinecone client for index %s", self._index_name)
            raise VectorStoreError(f"Failed to connect to Pinecone: {exc}") from exc

    def _upsert_batch_sync(self, payload: list[dict[str, Any]]) -> int:
        """Upsert one batch of vectors synchronously."""
        response = self._index.upsert(
            vectors=payload,
            namespace=self._namespace,
        )
        return int(response.upserted_count)

    def _search_sync(
        self,
        query_vector: list[float],
        top_k: int,
        session_id: str,
    ) -> list[SearchResult]:
        """Run a similarity search synchronously."""
        query_filter = _build_doc_filter(session_id)
        response = self._index.query(
            vector=query_vector,
            top_k=top_k,
            namespace=self._namespace,
            filter=query_filter,
            include_metadata=True,
            include_values=False,
        )

        results: list[SearchResult] = []
        for match in response.matches:
            if not match.metadata:
                logger.warning("Skipping match %s with missing metadata", match.id)
                continue

            results.append(
                SearchResult(
                    id=match.id,
                    score=float(match.score),
                    metadata=_parse_metadata(match.metadata),
                )
            )
        return results

    def _delete_document_sync(self, doc_id: str) -> None:
        """Delete all vectors for a document synchronously."""
        self._index.delete(
            filter={"doc_id": {"$eq": doc_id}},
            namespace=self._namespace,
        )

    async def upsert_document(
        self,
        doc_id: str,
        filename: str,
        chunks: list[EmbeddedChunk],
        session_id: str,
    ) -> int:
        """Store all embeddings for a document in batches.

        Args:
            doc_id: Unique document identifier.
            filename: Original uploaded filename.
            chunks: Embedded chunks from embedder.py.
            session_id: Client session identifier for isolation.

        Returns:
            Number of vectors upserted.

        Raises:
            VectorStoreError: If upserting fails.
        """
        if not chunks:
            logger.warning(
                "upsert_document received empty chunk list for doc_id=%s session_id=%s",
                doc_id,
                session_id,
            )
            return 0

        records = _chunks_to_records(doc_id, filename, chunks, session_id)
        batches = _batch_records(records, self._upsert_batch_size)
        upserted_total = 0

        logger.info(
            "Upserting %d vectors for doc_id=%s session_id=%s in %d batches (namespace=%r)",
            len(records),
            doc_id,
            session_id,
            len(batches),
            self._namespace,
        )

        try:
            for batch_number, batch in enumerate(batches, start=1):
                payload = _records_to_upsert_payload(batch)
                upserted_count = await asyncio.to_thread(self._upsert_batch_sync, payload)
                upserted_total += upserted_count
                logger.info(
                    "Upserted batch %d/%d for doc_id=%s (%d vectors)",
                    batch_number,
                    len(batches),
                    doc_id,
                    upserted_count,
                )
        except Exception as exc:
            logger.error("Pinecone upsert failed for doc_id=%s: %s", doc_id, exc)
            raise VectorStoreError(f"Failed to upsert vectors for '{doc_id}': {exc}") from exc

        logger.info("Upserted %d vectors for doc_id=%s", upserted_total, doc_id)
        return upserted_total

    async def search(
        self,
        query_vector: list[float],
        session_id: str,
        top_k: int = DEFAULT_TOP_K,
    ) -> list[SearchResult]:
        """Find the most similar stored vectors.

        Args:
            query_vector: Query embedding from embedder.py.
            top_k: Maximum number of matches to return.
            session_id: Client session identifier for isolation.

        Returns:
            Ranked search results with metadata for the retriever layer.

        Raises:
            VectorStoreError: If the query fails.
        """
        if not query_vector:
            raise VectorStoreError("Query vector must not be empty.")

        logger.info(
            "Searching index %s for top %d matches (namespace=%r, session_id=%s)",
            self._index_name,
            top_k,
            self._namespace,
            session_id,
        )

        try:
            results = await asyncio.to_thread(
                self._search_sync,
                query_vector,
                top_k,
                session_id,
            )
        except Exception as exc:
            logger.error("Pinecone search failed: %s", exc)
            raise VectorStoreError(f"Vector search failed: {exc}") from exc

        logger.info("Search returned %d matches", len(results))
        return results

    async def delete_document(self, doc_id: str) -> None:
        """Delete all vectors belonging to a document.

        Args:
            doc_id: Document whose vectors should be removed.

        Raises:
            VectorStoreError: If deletion fails.
        """
        logger.info(
            "Deleting vectors for doc_id=%s (namespace=%r)",
            doc_id,
            self._namespace,
        )

        try:
            await asyncio.to_thread(self._delete_document_sync, doc_id)
        except Exception as exc:
            logger.error("Pinecone delete failed for doc_id=%s: %s", doc_id, exc)
            raise VectorStoreError(
                f"Failed to delete vectors for '{doc_id}': {exc}"
            ) from exc

        logger.info("Deleted vectors for doc_id=%s", doc_id)


def create_vector_store(
    api_key: str | None = None,
    index_name: str | None = None,
    namespace: str | None = None,
) -> PineconeVectorStore:
    """Create a Pinecone vector store instance."""
    return PineconeVectorStore(
        api_key=api_key,
        index_name=index_name,
        namespace=namespace,
    )
