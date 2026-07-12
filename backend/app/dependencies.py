"""dependencies.py — FastAPI dependency providers for shared application services."""

from __future__ import annotations

from fastapi import HTTPException, Request, status

from app.middleware.request_id import SESSION_ID_HEADER
from app.services.llm import OpenAILLMService
from app.services.retriever import Retriever
from app.services.vector_store import VectorStoreProvider


def get_vector_store(request: Request) -> VectorStoreProvider:
    """Return the shared vector store from application state."""
    return request.app.state.vector_store


def get_retriever(request: Request) -> Retriever:
    """Return the shared retriever from application state."""
    return request.app.state.retriever


def get_llm_service(request: Request) -> OpenAILLMService:
    """Return the shared LLM service from application state."""
    return request.app.state.llm_service


def get_document_registry(request: Request) -> dict:
    """Return the in-memory document registry from application state."""
    return request.app.state.document_registry


def get_session_id(request: Request) -> str:
    """Return the session ID from the request headers.

    Args:
        request: Incoming HTTP request.

    Returns:
        Session identifier for the current client session.

    Raises:
        HTTPException: If the session header is missing or empty.
    """
    session_id = request.headers.get(SESSION_ID_HEADER, "").strip()
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Session-ID header is required",
        )
    return session_id
