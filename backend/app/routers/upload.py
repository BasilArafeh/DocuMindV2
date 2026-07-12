"""upload.py — Document upload routes."""

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.core.logging import get_logger
from app.dependencies import get_document_registry, get_session_id, get_vector_store
from app.middleware.rate_limiter import limiter
from app.models.schemas import UploadResponse
from app.services.ingestion import IngestionError, IngestionResult, ingest_document
from app.services.vector_store import VectorStoreProvider

logger = get_logger(__name__)

router = APIRouter(tags=["upload"])


def _to_upload_response(result: IngestionResult) -> UploadResponse:
    """Map an ingestion result to the API response model."""
    return UploadResponse(
        doc_id=result.doc_id,
        filename=result.filename,
        chunks_created=result.chunks_created,
        vectors_stored=result.vectors_stored,
        characters_extracted=result.characters_extracted,
        file_size_mb=round(result.file_size_bytes / (1024 * 1024), 2),
        duration_seconds=round(result.duration_ms / 1000, 2),
    )


@router.post(
    "/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Depends(get_session_id),
    registry: dict = Depends(get_document_registry),
    vector_store: VectorStoreProvider = Depends(get_vector_store),
) -> UploadResponse:
    """Upload and ingest a document into the vector database."""
    filename = file.filename or "unknown"
    logger.info("Received upload request filename=%s session_id=%s", filename, session_id)

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must include a filename.",
        )

    try:
        result = await ingest_document(
            file=file,
            vector_store=vector_store,
            session_id=session_id,
            registry=registry,
        )
    except IngestionError as exc:
        logger.error(
            "Upload ingestion failed filename=%s status_code=%d: %s",
            filename,
            exc.status_code,
            exc.message,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    response = _to_upload_response(result)
    logger.info(
        "Upload completed doc_id=%s filename=%s chunks=%d vectors=%d file_size_mb=%.2f duration_seconds=%.2f",
        response.doc_id,
        response.filename,
        response.chunks_created,
        response.vectors_stored,
        response.file_size_mb,
        response.duration_seconds,
    )
    return response
