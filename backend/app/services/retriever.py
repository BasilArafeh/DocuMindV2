"""retriever.py — Retrieve relevant document chunks for the RAG pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import cohere

from app.core.config import settings
from app.core.logging import get_logger
from app.services.embedder import (
    EmbeddingError,
    EmbeddingProvider,
    OpenAIEmbeddingProvider,
)
from app.services.vector_store import (
    SearchResult,
    VectorMetadata,
    VectorStoreError,
    VectorStoreProvider,
)

logger = get_logger(__name__)

CANDIDATE_TOP_K = 20
FINAL_TOP_K = 5
MIN_RELEVANCE_SCORE = 0.3
COHERE_RERANK_MODEL = "rerank-v3.5"


class RetrieverError(Exception):
    """Raised when retrieval fails."""


@dataclass(frozen=True)
class RetrievedChunk:
    """A chunk retrieved for answer generation."""

    id: str
    score: float
    text: str
    metadata: VectorMetadata


class RerankerProvider(Protocol):
    """Interface for swappable reranking backends."""

    async def rerank(
        self,
        query: str,
        documents: list[str],
        top_n: int,
    ) -> list[tuple[int, float]]:
        """Rerank documents and return (index, score) pairs."""
        ...


class CohereReranker:
    """Cohere reranking backend."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = COHERE_RERANK_MODEL,
    ) -> None:
        self._model = model
        self._client = cohere.AsyncClientV2(api_key=api_key or settings.COHERE_API_KEY)

    async def rerank(
        self,
        query: str,
        documents: list[str],
        top_n: int,
    ) -> list[tuple[int, float]]:
        """Rerank documents with the Cohere API."""
        response = await self._client.rerank(
            model=self._model,
            query=query,
            documents=documents,
            top_n=top_n,
        )
        return [
            (result.index, float(result.relevance_score))
            for result in response.results
        ]


def _search_result_to_chunk(result: SearchResult) -> RetrievedChunk:
    """Convert a vector search result into a retrieved chunk."""
    return RetrievedChunk(
        id=result.id,
        score=result.score,
        text=result.metadata.text,
        metadata=result.metadata,
    )


def _filter_by_relevance_score(
    chunks: list[RetrievedChunk],
    min_score: float,
) -> list[RetrievedChunk]:
    """Drop chunks below the minimum relevance score."""
    filtered = [chunk for chunk in chunks if chunk.score >= min_score]
    removed_count = len(chunks) - len(filtered)

    if removed_count:
        logger.info(
            "Filtered %d chunks below relevance score %.2f",
            removed_count,
            min_score,
        )

    return filtered


class Retriever:
    """RAG retrieval component for semantic search and optional reranking."""

    def __init__(
        self,
        vector_store: VectorStoreProvider,
        embedder: EmbeddingProvider | None = None,
        reranker: RerankerProvider | None = None,
        candidate_top_k: int = CANDIDATE_TOP_K,
        final_top_k: int = FINAL_TOP_K,
        min_relevance_score: float = MIN_RELEVANCE_SCORE,
        rerank_enabled: bool | None = None,
    ) -> None:
        self._vector_store = vector_store
        self._embedder = embedder or OpenAIEmbeddingProvider()
        self._candidate_top_k = candidate_top_k
        self._final_top_k = final_top_k
        self._min_relevance_score = min_relevance_score
        self._rerank_enabled = (
            rerank_enabled
            if rerank_enabled is not None
            else settings.COHERE_RERANK_ENABLED
        )
        self._reranker = reranker or (
            CohereReranker() if self._rerank_enabled else None
        )

    async def _embed_query(self, query: str) -> list[float]:
        """Generate an embedding vector for a user query."""
        try:
            vectors = await self._embedder.embed_texts([query])
        except EmbeddingError as exc:
            logger.error("Query embedding failed: %s", exc)
            raise RetrieverError(f"Query embedding failed: {exc}") from exc

        if not vectors:
            raise RetrieverError("Query embedding returned no vectors.")

        return vectors[0]

    async def _search_candidates(
        self,
        query_vector: list[float],
        session_id: str,
    ) -> list[RetrievedChunk]:
        """Retrieve candidate chunks from the vector store."""
        try:
            results = await self._vector_store.search(
                query_vector=query_vector,
                session_id=session_id,
                top_k=self._candidate_top_k,
            )
        except VectorStoreError as exc:
            logger.error("Vector search failed: %s", exc)
            raise RetrieverError(f"Vector search failed: {exc}") from exc

        return [_search_result_to_chunk(result) for result in results]

    async def _apply_reranking(
        self,
        query: str,
        candidates: list[RetrievedChunk],
    ) -> list[RetrievedChunk]:
        """Rerank candidate chunks with Cohere."""
        if self._reranker is None:
            return candidates[: self._final_top_k]

        documents = [chunk.text for chunk in candidates]

        try:
            ranked = await self._reranker.rerank(
                query=query,
                documents=documents,
                top_n=min(self._final_top_k, len(documents)),
            )
        except Exception as exc:
            logger.warning(
                "Cohere rerank failed, falling back to Pinecone ranking: %s",
                exc,
            )
            return candidates[: self._final_top_k]

        reranked: list[RetrievedChunk] = []
        for index, score in ranked:
            candidate = candidates[index]
            reranked.append(
                RetrievedChunk(
                    id=candidate.id,
                    score=score,
                    text=candidate.text,
                    metadata=candidate.metadata,
                )
            )

        logger.info("Reranked %d candidates down to %d chunks", len(candidates), len(reranked))
        return reranked

    async def retrieve(
        self,
        query: str,
        session_id: str,
    ) -> list[RetrievedChunk]:
        """Retrieve the most relevant chunks for a user query.

        Args:
            query: Natural-language user question.
            session_id: Client session identifier for isolation.

        Returns:
            Ranked chunks ready for llm.py.

        Raises:
            RetrieverError: If retrieval fails.
        """
        stripped_query = query.strip()
        if not stripped_query:
            raise RetrieverError("Query must not be empty.")

        logger.info(
            "Retrieving chunks (candidates=%d, final=%d, min_score=%.2f, rerank=%s, session_id=%s)",
            self._candidate_top_k,
            self._final_top_k,
            self._min_relevance_score,
            self._rerank_enabled,
            session_id,
        )

        query_vector = await self._embed_query(stripped_query)
        candidates = await self._search_candidates(query_vector, session_id)
        candidates = _filter_by_relevance_score(candidates, self._min_relevance_score)

        if not candidates:
            logger.info("No retrieval candidates met the relevance threshold")
            return []

        if self._rerank_enabled:
            chunks = await self._apply_reranking(stripped_query, candidates)
        else:
            chunks = candidates[: self._final_top_k]

        chunks = _filter_by_relevance_score(chunks, self._min_relevance_score)

        logger.info("Retrieved %d chunks for query", len(chunks))
        return chunks


def create_retriever(
    vector_store: VectorStoreProvider,
    embedder: EmbeddingProvider | None = None,
    reranker: RerankerProvider | None = None,
    rerank_enabled: bool | None = None,
) -> Retriever:
    """Create a retriever instance."""
    return Retriever(
        vector_store=vector_store,
        embedder=embedder,
        reranker=reranker,
        rerank_enabled=rerank_enabled,
    )
