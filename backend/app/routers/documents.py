"""documents.py — Document listing and deletion routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.core.logging import get_logger
from app.dependencies import (
    get_document_registry,
    get_session_id,
    get_vector_store,
)
from app.middleware.rate_limiter import limiter
from app.models.schemas import DocumentListResponse, DocumentMeta
from app.services.vector_store import VectorStoreError, VectorStoreProvider

logger = get_logger(__name__)

router = APIRouter(tags=["documents"])


@router.get("/documents", response_model=DocumentListResponse)
@limiter.limit("60/minute")
async def list_documents(
    request: Request,
    session_id: str = Depends(get_session_id),
    registry: dict = Depends(get_document_registry),
) -> DocumentListResponse:
    """List all documents uploaded in the current session."""
    session_documents = registry.get(session_id, [])
    logger.info(
        "Listing documents session_id=%s document_count=%d",
        session_id,
        len(session_documents),
    )

    documents = [
        DocumentMeta(
            doc_id=entry["doc_id"],
            filename=entry["filename"],
            chunk_count=entry["chunk_count"],
            upload_time=entry["upload_time"],
        )
        for entry in session_documents
    ]
    return DocumentListResponse(documents=documents)


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def delete_document(
    request: Request,
    doc_id: str,
    session_id: str = Depends(get_session_id),
    registry: dict = Depends(get_document_registry),
    vector_store: VectorStoreProvider = Depends(get_vector_store),
) -> Response:
    """Delete a document from the current session and vector store."""
    session_documents = registry.get(session_id, [])
    document_entry = next(
        (entry for entry in session_documents if entry["doc_id"] == doc_id),
        None,
    )

    if document_entry is None:
        logger.warning(
            "Document not found for deletion session_id=%s doc_id=%s",
            session_id,
            doc_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{doc_id}' not found.",
        )

    logger.info(
        "Deleting document session_id=%s doc_id=%s filename=%s",
        session_id,
        doc_id,
        document_entry["filename"],
    )

    try:
        await vector_store.delete_document(doc_id)
    except VectorStoreError as exc:
        logger.error(
            "Vector deletion failed session_id=%s doc_id=%s: %s",
            session_id,
            doc_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document '{doc_id}'.",
        ) from exc

    registry[session_id] = [
        entry for entry in session_documents if entry["doc_id"] != doc_id
    ]

    logger.info(
        "Deleted document session_id=%s doc_id=%s",
        session_id,
        doc_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
