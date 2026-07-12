"""request_id.py — Assign a unique request ID to every HTTP request."""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger, request_id_var

logger = get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
SESSION_ID_HEADER = "X-Session-ID"

session_id_var: ContextVar[str] = ContextVar("session_id", default="anonymous")

__all__ = [
    "REQUEST_ID_HEADER",
    "SESSION_ID_HEADER",
    "RequestIdMiddleware",
    "request_id_var",
    "session_id_var",
]


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a request ID and session ID to each request and response.

    The request ID is read from the ``X-Request-ID`` header when provided by the
    client. Otherwise a new UUID4 hex value is generated. The session ID is read
    from ``X-Session-ID`` when provided; otherwise ``anonymous`` is used.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Process the request and attach the request ID to the response.

        Args:
            request: Incoming HTTP request.
            call_next: Next middleware or route handler.

        Returns:
            HTTP response with the ``X-Request-ID`` header set.
        """
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        session_id = request.headers.get(SESSION_ID_HEADER, "").strip() or "anonymous"

        request.state.request_id = request_id
        request.state.session_id = session_id

        request_context_token = request_id_var.set(request_id)
        session_context_token = session_id_var.set(session_id)

        logger.debug(
            "Assigned request_id=%s session_id=%s method=%s path=%s",
            request_id,
            session_id,
            request.method,
            request.url.path,
        )

        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            request_id_var.reset(request_context_token)
            session_id_var.reset(session_context_token)
