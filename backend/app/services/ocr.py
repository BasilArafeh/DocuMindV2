"""ocr.py — OCR text extraction from images using Tesseract."""

from __future__ import annotations

import re

import pytesseract
from PIL import Image, ImageEnhance

from app.core.logging import get_logger

logger = get_logger(__name__)

TESSERACT_CONFIG = "--psm 6"


class OCRError(Exception):
    """Raised when OCR extraction fails."""


def _normalize_whitespace(text: str) -> str:
    """Collapse excessive whitespace while preserving paragraph breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _preprocess_image(image: Image.Image) -> Image.Image:
    """Prepare an image for OCR: grayscale, higher contrast, then binarize."""
    gray = image.convert("L")
    contrast = ImageEnhance.Contrast(gray).enhance(2.0)
    return contrast.point(lambda pixel: 255 if pixel > 128 else 0)


def extract_text_from_image(image: Image.Image) -> str:
    """Extract plain text from an image using Tesseract OCR.

    Args:
        image: A PIL Image to run OCR on.

    Returns:
        Normalized plain text extracted from the image.

    Raises:
        OCRError: If Tesseract fails or is unavailable.
    """
    logger.info(
        "Running OCR on image (%sx%s, mode=%s)",
        image.width,
        image.height,
        image.mode,
    )

    processed = _preprocess_image(image)

    try:
        raw_text = pytesseract.image_to_string(processed, config=TESSERACT_CONFIG)
    except pytesseract.TesseractNotFoundError as exc:
        logger.error("Tesseract binary not found or not configured")
        raise OCRError(
            "Tesseract OCR is not installed or not available on PATH."
        ) from exc
    except pytesseract.TesseractError as exc:
        logger.error("Tesseract OCR failed: %s", exc)
        raise OCRError(f"OCR extraction failed: {exc}") from exc
    except Exception as exc:
        logger.exception("Unexpected OCR failure")
        raise OCRError(f"Unexpected OCR failure: {exc}") from exc

    cleaned = _normalize_whitespace(raw_text or "")
    if not cleaned:
        logger.warning("OCR returned no text")
    else:
        logger.info("OCR extracted %d characters", len(cleaned))
    return cleaned
