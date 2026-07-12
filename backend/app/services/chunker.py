"""chunker.py — Split document text into chunks for the RAG pipeline."""

from __future__ import annotations

from dataclasses import dataclass

import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.logging import get_logger

logger = get_logger(__name__)

TOKEN_ENCODING = "cl100k_base"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

TEXT_SEPARATORS = [
    "\n\n",
    "\n",
    ". ",
    "! ",
    "? ",
    " ",
    "",
]

_encoding: tiktoken.Encoding | None = None


def _get_encoding() -> tiktoken.Encoding:
    global _encoding
    if _encoding is None:
        _encoding = tiktoken.get_encoding(TOKEN_ENCODING)
    return _encoding


def _count_tokens(text: str) -> int:
    """Count tokens using the OpenAI-compatible cl100k_base tokenizer."""
    return len(_get_encoding().encode(text))


@dataclass(frozen=True)
class TextChunk:
    """A text segment ready for embedding.

    doc_id and filename are attached later by the ingestion pipeline.
    """

    text: str
    chunk_index: int


def chunk_text(text: str) -> list[TextChunk]:
    """Split document text into overlapping chunks for embedding.

    Args:
        text: Clean plain text from parser.py.

    Returns:
        Ordered list of text chunks with zero-based indices.
    """
    stripped = text.strip()
    if not stripped:
        logger.warning("chunk_text received empty text")
        return []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=_count_tokens,
        separators=TEXT_SEPARATORS,
    )

    segments = splitter.split_text(stripped)
    chunks = [
        TextChunk(text=segment, chunk_index=index)
        for index, segment in enumerate(segments)
    ]

    logger.info(
        "Split text into %d chunks (size=%d tokens, overlap=%d tokens)",
        len(chunks),
        CHUNK_SIZE,
        CHUNK_OVERLAP,
    )
    return chunks
