"""test_pipeline.py — API integration tests for the DocuMind pipeline."""

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

_startup_patches = [
    patch("app.main.create_vector_store", return_value=MagicMock()),
    patch("app.main.create_retriever", return_value=MagicMock()),
    patch("app.main.create_llm_service", return_value=MagicMock()),
]
for _patch in _startup_patches:
    _patch.start()

from app.main import app  # noqa: E402
from app.dependencies import get_llm_service, get_retriever  # noqa: E402
from app.services.ingestion import IngestionResult  # noqa: E402
from app.services.retriever import RetrievedChunk  # noqa: E402
from app.services.vector_store import VectorMetadata  # noqa: E402


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """Async HTTP client for the FastAPI application."""
    app.state.vector_store = MagicMock()
    app.state.retriever = MagicMock()
    app.state.llm_service = MagicMock()
    app.state.document_registry = {}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.state.document_registry = {}


@pytest.fixture
def session_headers() -> dict[str, str]:
    """Default session headers for authenticated requests."""
    return {"X-Session-ID": "test-session-1"}


@pytest.fixture
def mock_ingest() -> AsyncIterator[AsyncMock]:
    """Mock document ingestion for upload tests."""
    fake_result = IngestionResult(
        doc_id="test-doc-id",
        filename="test.pdf",
        chunks_created=5,
        vectors_stored=5,
        characters_extracted=1000,
        file_size_bytes=1024,
        duration_ms=500,
    )
    with patch(
        "app.routers.upload.ingest_document",
        new_callable=AsyncMock,
        return_value=fake_result,
    ) as mock:
        yield mock


@pytest.fixture
def mock_vector_store() -> AsyncIterator[MagicMock]:
    """Mock vector store for document deletion tests."""
    mock_store = MagicMock()
    mock_store.delete_document = AsyncMock()
    with patch(
        "app.routers.documents.get_vector_store",
        return_value=mock_store,
    ):
        yield mock_store


async def test_health_check(client: AsyncClient) -> None:
    """GET /health returns a healthy status."""
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


async def test_upload_valid_pdf(
    client: AsyncClient,
    session_headers: dict[str, str],
    mock_ingest: AsyncMock,
) -> None:
    """POST /upload with a PDF file returns ingestion metadata."""
    response = await client.post(
        "/upload",
        headers=session_headers,
        files={"file": ("test.pdf", b"%PDF-1.4 fake pdf content", "application/pdf")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["doc_id"] == "test-doc-id"
    assert body["filename"] == "test.pdf"
    assert body["chunks_created"] == 5
    assert body["vectors_stored"] == 5
    mock_ingest.assert_awaited_once()


async def test_upload_missing_session_id(client: AsyncClient) -> None:
    """POST /upload without X-Session-ID is rejected."""
    response = await client.post(
        "/upload",
        files={"file": ("test.pdf", b"%PDF-1.4 fake pdf content", "application/pdf")},
    )

    assert response.status_code == 400
    assert "X-Session-ID" in response.json()["detail"]


async def test_upload_unsupported_file_type(
    client: AsyncClient,
    session_headers: dict[str, str],
) -> None:
    """POST /upload with an unsupported file type returns 415."""
    response = await client.post(
        "/upload",
        headers=session_headers,
        files={"file": ("test.exe", b"MZ fake executable", "application/octet-stream")},
    )

    assert response.status_code == 415


async def test_upload_no_file(
    client: AsyncClient,
    session_headers: dict[str, str],
) -> None:
    """POST /upload without a file returns 422."""
    response = await client.post("/upload", headers=session_headers)

    assert response.status_code == 422


async def test_list_documents_missing_session_id(client: AsyncClient) -> None:
    """GET /documents without X-Session-ID is rejected."""
    response = await client.get("/documents")

    assert response.status_code == 400
    assert "X-Session-ID" in response.json()["detail"]


async def test_list_documents_empty_session(client: AsyncClient) -> None:
    """GET /documents for a new session returns an empty list."""
    response = await client.get(
        "/documents",
        headers={"X-Session-ID": "fresh-empty-session"},
    )

    assert response.status_code == 200
    assert response.json() == {"documents": []}


async def test_delete_document_not_found(
    client: AsyncClient,
    session_headers: dict[str, str],
    mock_vector_store: MagicMock,
) -> None:
    """DELETE /documents/{doc_id} returns 404 when the document is missing."""
    response = await client.delete(
        "/documents/nonexistent-id",
        headers=session_headers,
    )

    assert response.status_code == 404
    mock_vector_store.delete_document.assert_not_awaited()


async def test_chat_missing_session_id(client: AsyncClient) -> None:
    """POST /chat without X-Session-ID is rejected."""
    response = await client.post("/chat", json={"question": "what is this about?"})

    assert response.status_code == 400
    assert "X-Session-ID" in response.json()["detail"]


async def test_chat_empty_question(
    client: AsyncClient,
    session_headers: dict[str, str],
) -> None:
    """POST /chat with an empty question returns 422."""
    response = await client.post(
        "/chat",
        headers=session_headers,
        json={"question": ""},
    )

    assert response.status_code == 422


async def test_chat_returns_event_stream(
    client: AsyncClient,
    session_headers: dict[str, str],
) -> None:
    """POST /chat returns a Server-Sent Events stream."""
    chunk = RetrievedChunk(
        id="test-doc-id_0",
        score=0.9,
        text="This is test document content about something important.",
        metadata=VectorMetadata(
            doc_id="test-doc-id",
            filename="test.pdf",
            chunk_index=0,
            text="This is test document content about something important.",
            session_id="test-session-1",
        ),
    )
    mock_retriever = MagicMock()
    mock_retriever.retrieve = AsyncMock(return_value=[chunk])

    async def mock_stream_answer(
        question: str,
        chunks: list[RetrievedChunk],
    ) -> AsyncIterator[str]:
        yield "Hello"

    mock_llm = MagicMock()
    mock_llm.stream_answer = mock_stream_answer

    app.dependency_overrides[get_retriever] = lambda: mock_retriever
    app.dependency_overrides[get_llm_service] = lambda: mock_llm
    try:
        response = await client.post(
            "/chat",
            headers=session_headers,
            json={"question": "what is this about?"},
        )
    finally:
        app.dependency_overrides.pop(get_retriever, None)
        app.dependency_overrides.pop(get_llm_service, None)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
