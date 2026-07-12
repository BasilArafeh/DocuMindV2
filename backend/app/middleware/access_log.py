"""access_log.py — HTTP request and response access logging middleware."""

from __future__ import annotations

import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger

logger = get_logger(__name__)


def _get_client_ip(request: Request) -> str:
    """Return the client IP address for the request.

    Args:
        request: Incoming HTTP request.

    Returns:
        Client IP address or ``unknown`` when unavailable.
    """
    if request.client is None:
        return "unknown"
    return request.client.host


def _get_request_id(request: Request) -> str:
    """Return the request ID from request state when available.

    Args:
        request: Incoming HTTP request.

    Returns:
        Request ID string.
    """
    return getattr(request.state, "request_id", "no-request-id")


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Log basic HTTP request and response metadata.

    This middleware records method, path, client IP, status code, and duration.
    It intentionally avoids logging request bodies or uploaded file contents.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Log request completion metadata.

        Args:
            request: Incoming HTTP request.
            call_next: Next middleware or route handler.

        Returns:
            HTTP response from downstream handlers.
        """
        started_at = time.perf_counter()
        request_id = _get_request_id(request)
        method = request.method
        path = request.url.path
        client_ip = _get_client_ip(request)
        status_code = 500

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            if status_code >= 500:
                logger.error(
                    "HTTP request completed request_id=%s method=%s path=%s client_ip=%s status_code=%d duration_ms=%d",
                    request_id,
                    method,
                    path,
                    client_ip,
                    status_code,
                    duration_ms,
                )
            elif status_code >= 400:
                logger.warning(
                    "HTTP request completed request_id=%s method=%s path=%s client_ip=%s status_code=%d duration_ms=%d",
                    request_id,
                    method,
                    path,
                    client_ip,
                    status_code,
                    duration_ms,
                )
            else:
                logger.info(
                    "HTTP request completed request_id=%s method=%s path=%s client_ip=%s status_code=%d duration_ms=%d",
                    request_id,
                    method,
                    path,
                    client_ip,
                    status_code,
                    duration_ms,
                )
