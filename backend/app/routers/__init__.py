"""Routers package for the DocuMind API."""

from app.routers.chat import router as chat_router
from app.routers.documents import router as documents_router
from app.routers.health import router as health_router
from app.routers.upload import router as upload_router

__all__ = ["chat_router", "documents_router", "health_router", "upload_router"]
