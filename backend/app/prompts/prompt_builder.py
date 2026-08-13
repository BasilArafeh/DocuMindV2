"""prompt_builder.py — Prompt construction helpers for DocuMind."""

from __future__ import annotations

from app.prompts.system_prompt import SYSTEM_PROMPT
from app.services.retriever import RetrievedChunk


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
) -> tuple[list[RetrievedChunk], str]:
    """Format all retrieved chunks into a prompt context block.

    Context size is controlled upstream by chunk size and top-K retrieval,
    not by runtime character truncation.

    Args:
        chunks: Retrieved chunks from the retriever layer.

    Returns:
        A tuple of the chunks and the formatted context block.
    """
    if not chunks:
        return [], "No document context was retrieved."

    sections = [
        _format_chunk_section(index, chunk)
        for index, chunk in enumerate(chunks, start=1)
    ]
    return chunks, "\n\n".join(sections)


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
        Chat messages and the chunks used as context.
    """
    included_chunks, context_block = prepare_prompt_context(chunks)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_rag_prompt(question, context_block)},
    ]
    return messages, included_chunks
