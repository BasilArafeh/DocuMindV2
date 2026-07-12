"""parser.py — Extract clean plain text from uploaded documents."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import fitz
from fastapi import UploadFile
from PIL import Image

from app.core.config import settings
from app.core.logging import get_logger
from app.services.ocr import OCRError, extract_text_from_image

logger = get_logger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}
MIN_EXTRACTED_CHARS = 50
OCR_RENDER_DPI = 200


class DocumentParsingError(Exception):
    """Base exception for document parsing failures."""

    def __init__(self, message: str, status_code: int = 422) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class UnsupportedFileTypeError(DocumentParsingError):
    """Raised when the uploaded file type is not supported."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=415)


class FileTooLargeError(DocumentParsingError):
    """Raised when the uploaded file exceeds the size limit."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=413)


class EmptyFileError(DocumentParsingError):
    """Raised when the uploaded file contains no data."""


class ExtractionError(DocumentParsingError):
    """Raised when no usable text could be extracted from a document."""


def _normalize_whitespace(text: str) -> str:
    """Collapse excessive whitespace while preserving paragraph breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _strip_markdown(text: str) -> str:
    """Reduce markdown syntax to plain text."""
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"(\*\*|__)(.*?)\1", r"\2", text)
    text = re.sub(r"(\*|_)(.*?)\1", r"\2", text)
    text = re.sub(r"^>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\*\-+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\|.*\|$", "", text, flags=re.MULTILINE)
    text = re.sub(r"^-{3,}$", "", text, flags=re.MULTILINE)
    return text


def _page_to_image(page: fitz.Page) -> Image.Image:
    """Render a PDF page to a PIL image for OCR."""
    pixmap = page.get_pixmap(dpi=OCR_RENDER_DPI)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def _ocr_pdf(data: bytes, filename: str) -> str:
    """Extract text from a PDF by OCRing each rendered page."""
    parts: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        logger.info("Running OCR fallback on %d pages for %s", doc.page_count, filename)
        for page_number, page in enumerate(doc, start=1):
            page_text = extract_text_from_image(_page_to_image(page))
            if page_text:
                parts.append(page_text)
            else:
                logger.warning(
                    "OCR returned no text for page %d of %s",
                    page_number,
                    filename,
                )
    return "\n\n".join(parts)


def _extract_pdf(data: bytes, filename: str) -> str:
    """Extract text from a PDF, falling back to OCR when needed."""
    parts: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            parts.append(page.get_text("text"))

    cleaned = _normalize_whitespace("\n".join(parts))
    if len(cleaned) >= MIN_EXTRACTED_CHARS:
        logger.info(
            "PyMuPDF extracted %d characters from %s",
            len(cleaned),
            filename,
        )
        return cleaned

    logger.info(
        "PyMuPDF extraction too short (%d chars) for %s, using OCR fallback",
        len(cleaned),
        filename,
    )

    try:
        ocr_text = _ocr_pdf(data, filename)
    except OCRError as exc:
        raise ExtractionError(
            f"OCR failed while processing '{filename}': {exc}"
        ) from exc

    return _normalize_whitespace(ocr_text)


def _extract_text(data: bytes, extension: str) -> str:
    """Decode TXT/MD bytes and strip markdown when needed."""
    text = data.decode("utf-8", errors="replace")
    if extension == ".md":
        text = _strip_markdown(text)
    return text


def _extract_sync(data: bytes, extension: str, filename: str) -> str:
    """Run CPU/file-bound extraction synchronously for asyncio.to_thread."""
    logger.info("Extracting text from %s (%s)", filename, extension)

    if extension == ".pdf":
        cleaned = _extract_pdf(data, filename)
    else:
        cleaned = _normalize_whitespace(_extract_text(data, extension))

    if len(cleaned) < MIN_EXTRACTED_CHARS:
        raise ExtractionError(
            f"No text could be extracted from '{filename}'. "
            "The file may be empty, image-only, or a scanned PDF without readable text."
        )

    logger.info(
        "Extracted %d characters from %s",
        len(cleaned),
        filename,
    )
    return cleaned


async def parse_file(file: UploadFile) -> str:
    """Parse an uploaded file into clean plain text."""
    filename = file.filename or "unknown"
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFileTypeError(
            f"Unsupported file type '{extension or 'unknown'}'. "
            f"Allowed types: {', '.join(sorted(SUPPORTED_EXTENSIONS))}."
        )

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    data = await file.read()

    if len(data) > max_bytes:
        raise FileTooLargeError(
            f"File '{filename}' exceeds the maximum allowed size "
            f"of {settings.MAX_FILE_SIZE_MB} MB."
        )

    if not data:
        raise EmptyFileError(f"File '{filename}' is empty.")

    logger.info(
        "Parsing upload '%s' (%d bytes)",
        filename,
        len(data),
    )

    return await asyncio.to_thread(_extract_sync, data, extension, filename)
