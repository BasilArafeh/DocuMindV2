"""exception_handler.py — Centralized API exception handling."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.core.logging import get_logger, request_id_var
from app.middleware.request_id import REQUEST_ID_HEADER

logger = get_logger(__name__)


def _get_request_id(request: Request) -> str:
    """Return the request ID associated with the current request.

    Args:
        request: Incoming HTTP request.

    Returns:
        Request ID string.
    """
    return getattr(request.state, "request_id", request_id_var.get())


def _error_content(request: Request, detail: Any) -> dict[str, Any]:
    """Build a consistent JSON error payload.

    Args:
        request: Incoming HTTP request.
        detail: Error detail payload.

    Returns:
        JSON-serializable error body.
    """
    return {
        "detail": detail,
        "request_id": _get_request_id(request),
    }


def _json_error_response(
    request: Request,
    status_code: int,
    detail: Any,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build a JSON error response with request ID header.

    Args:
        request: Incoming HTTP request.
        status_code: HTTP status code.
        detail: Error detail payload.
        headers: Optional additional response headers.

    Returns:
        JSON error response.
    """
    response_headers = {REQUEST_ID_HEADER: _get_request_id(request)}
    if headers:
        response_headers.update(headers)

    return JSONResponse(
        status_code=status_code,
        content=_error_content(request, detail),
        headers=response_headers,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle explicit HTTP exceptions raised by the API.

    Args:
        request: Incoming HTTP request.
        exc: Raised HTTP exception.

    Returns:
        JSON error response with the original status code.
    """
    if exc.status_code >= 500:
        logger.error(
            "HTTP exception request_id=%s status_code=%d detail=%s",
            _get_request_id(request),
            exc.status_code,
            exc.detail,
        )

    return _json_error_response(
        request=request,
        status_code=exc.status_code,
        detail=exc.detail,
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Handle request validation failures.

    Args:
        request: Incoming HTTP request.
        exc: Raised validation exception.

    Returns:
        JSON validation error response.
    """
    logger.warning(
        "Request validation failed request_id=%s method=%s path=%s errors=%s",
        _get_request_id(request),
        request.method,
        request.url.path,
        exc.errors(),
    )

    return _json_error_response(
        request=request,
        status_code=422,
        detail=jsonable_encoder(exc.errors()),
    )


async def rate_limit_exceeded_handler(
    request: Request,
    exc: RateLimitExceeded,
) -> JSONResponse:
    """Handle rate limit violations with the standard API error format.

    Args:
        request: Incoming HTTP request.
        exc: Raised rate limit exception.

    Returns:
        JSON error response with HTTP 429 status.
    """
    logger.warning(
        "Rate limit exceeded request_id=%s method=%s path=%s detail=%s",
        _get_request_id(request),
        request.method,
        request.url.path,
        exc.detail,
    )

    response = _json_error_response(
        request=request,
        status_code=429,
        detail="You have exceeded the rate limit. Please try again later.",
    )

    limiter = getattr(request.app.state, "limiter", None)
    view_rate_limit = getattr(request.state, "view_rate_limit", None)
    if limiter is not None and view_rate_limit is not None:
        response = limiter._inject_headers(response, view_rate_limit)

    return response


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected application exceptions.

    Args:
        request: Incoming HTTP request.
        exc: Unhandled exception.

    Returns:
        Generic internal server error response.
    """
    logger.exception(
        "Unhandled exception request_id=%s method=%s path=%s",
        _get_request_id(request),
        request.method,
        request.url.path,
    )

    return _json_error_response(
        request=request,
        status_code=500,
        detail="Internal server error.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI application.

    Args:
        app: FastAPI application instance.
    """
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
