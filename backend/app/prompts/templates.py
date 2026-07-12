"""templates.py — Prompt construction helpers for DocuMind."""

from __future__ import annotations

from app.core.logging import get_logger
from app.prompts.system_prompt import SYSTEM_PROMPT
from app.services.retriever import RetrievedChunk

logger = get_logger(__name__)

MAX_CONTEXT_CHARS = 15000


def _format_chunk_section(index: int, chunk: RetrievedChunk) -> str:
    """Format a single retrieved chunk for the prompt context.

    Args:
        index: Source number shown to the model.
        chunk: Retrieved chunk to format.

    Returns:
        Formatted source block.
    """
    return "\n".join(
        [
            f"[Source {index}]",
            f"Filename: {chunk.metadata.filename}",
            f"Document ID: {chunk.metadata.doc_id}",
            f"Chunk Index: {chunk.metadata.chunk_index}",
            "Content:",
            chunk.text,
        ]
    )


def prepare_prompt_context(
    chunks: list[RetrievedChunk],
    max_chars: int = MAX_CONTEXT_CHARS,
) -> tuple[list[RetrievedChunk], str]:
    """Select and format context chunks within the character budget.

    Chunks are kept in retrieval order so the most relevant chunks are preserved.

    Args:
        chunks: Retrieved chunks from the retriever layer.
        max_chars: Maximum number of characters allowed in the context block.

    Returns:
        A tuple of included chunks and the formatted context block.
    """
    if not chunks:
        return [], "No document context was retrieved."

    included_chunks: list[RetrievedChunk] = []
    sections: list[str] = []
    total_chars = 0

    for index, chunk in enumerate(chunks, start=1):
        section = _format_chunk_section(index, chunk)
        separator_chars = 2 if sections else 0
        projected_chars = total_chars + separator_chars + len(section)

        if projected_chars <= max_chars:
            sections.append(section)
            included_chunks.append(chunk)
            total_chars = projected_chars
            continue

        if not sections:
            header = "\n".join(
                [
                    f"[Source {index}]",
                    f"Filename: {chunk.metadata.filename}",
                    f"Document ID: {chunk.metadata.doc_id}",
                    f"Chunk Index: {chunk.metadata.chunk_index}",
                    "Content:",
                ]
            )
            available_text_chars = max_chars - len(header) - 1
            if available_text_chars > 0:
                truncated_text = chunk.text[:available_text_chars]
                section = f"{header}\n{truncated_text}"
                sections.append(section)
                included_chunks.append(chunk)
                total_chars = len(section)
            break

        break

    if len(included_chunks) < len(chunks):
        logger.warning(
            "Context truncated: included %d of %d chunks (%d/%d chars)",
            len(included_chunks),
            len(chunks),
            total_chars,
            max_chars,
        )

    return included_chunks, "\n\n".join(sections)


def build_context_block(chunks: list[RetrievedChunk]) -> str:
    """Format retrieved chunks into a prompt context block.

    Args:
        chunks: Retrieved chunks from the retriever layer.

    Returns:
        Formatted context text for prompt assembly.
    """
    _, context_block = prepare_prompt_context(chunks)
    return context_block


def build_rag_prompt(question: str, context: str) -> str:
    """Build the user prompt for a RAG question-answering request.

    Args:
        question: The user's natural-language question.
        context: Formatted document context block.

    Returns:
        User message content for the chat completion request.
    """
    return (
        "Answer the question using only the document context below.\n\n"
        "Document Context:\n"
        f"{context}\n\n"
        "Question:\n"
        f"{question}"
    )


def build_messages(
    question: str,
    chunks: list[RetrievedChunk],
) -> list[dict[str, str]]:
    """Build chat messages for a RAG completion request.

    Args:
        question: The user's natural-language question.
        chunks: Retrieved chunks from the retriever layer.

    Returns:
        OpenAI-compatible chat messages.
    """
    _, context_block = prepare_prompt_context(chunks)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_rag_prompt(question, context_block)},
    ]


def build_messages_with_included_chunks(
    question: str,
    chunks: list[RetrievedChunk],
) -> tuple[list[dict[str, str]], list[RetrievedChunk]]:
    """Build chat messages and return the chunks included in the prompt.

    Args:
        question: The user's natural-language question.
        chunks: Retrieved chunks from the retriever layer.

    Returns:
        Chat messages and the chunks that fit within the context budget.
    """
    included_chunks, context_block = prepare_prompt_context(chunks)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_rag_prompt(question, context_block)},
    ]
    return messages, included_chunks
