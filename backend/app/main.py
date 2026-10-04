"""main.py — FastAPI application entry point."""

from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.middleware import (
    AccessLogMiddleware,
    RequestIdMiddleware,
    register_exception_handlers,
)
from app.middleware.exception_handler import rate_limit_exceeded_handler
from app.middleware.rate_limiter import limiter
from app.routers import chat_router, documents_router, health_router, upload_router
from app.routers.suggest_router import router as suggest_router
from app.services.llm import create_llm_service
from app.services.retriever import create_retriever
from app.services.vector_store import create_vector_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and tear down shared application services."""
    app.state.vector_store = create_vector_store()
    app.state.llm_service = create_llm_service()
    app.state.retriever = create_retriever(
        app.state.vector_store,
        llm_client=app.state.llm_service._client,
    )
    app.state.document_registry = {}
    yield


app = FastAPI(
    title="DocuMind API",
    description="RAG-based document assistant API.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://documindv2.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(AccessLogMiddleware)
app.add_middleware(RequestIdMiddleware)

app.include_router(health_router)
app.include_router(upload_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(suggest_router)
