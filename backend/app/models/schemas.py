"""schemas.py — API request and response models."""

from pydantic import BaseModel, field_validator


class UploadResponse(BaseModel):
    """Result of a document upload."""

    doc_id: str
    filename: str
    chunks_created: int
    vectors_stored: int
    characters_extracted: int
    file_size_mb: float
    duration_seconds: float


class ChatRequest(BaseModel):
    """Chat query request for the current session."""

    question: str

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        """Ensure the question is not blank."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("question must not be empty.")
        return stripped


class HealthResponse(BaseModel):
    """Health check response."""

    status: str


class Citation(BaseModel):
    """Source citation for an answer."""

    chunk_id: str
    text: str
    source: str


class ChatResponse(BaseModel):
    """Chat answer with citations."""

    answer: str
    citations: list[Citation]


class SummaryRequest(BaseModel):
    """Request to summarize a document."""

    doc_id: str


class SummaryResponse(BaseModel):
    """Document summary result."""

    doc_id: str
    summary: str


class DocumentMeta(BaseModel):
    """Metadata for an indexed document."""

    doc_id: str
    filename: str
    chunk_count: int
    upload_time: str


class DocumentListResponse(BaseModel):
    """List of indexed documents."""

    documents: list[DocumentMeta]
