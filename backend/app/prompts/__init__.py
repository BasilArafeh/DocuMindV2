"""Prompt templates and system instructions for DocuMind."""

from app.prompts.system_prompt import SYSTEM_PROMPT
from app.prompts.prompt_builder import (
    build_context_block,
    build_messages,
    build_messages_with_included_chunks,
    build_rag_prompt,
    prepare_prompt_context,
)

__all__ = [
    "SYSTEM_PROMPT",
    "build_context_block",
    "build_messages",
    "build_messages_with_included_chunks",
    "build_rag_prompt",
    "prepare_prompt_context",
]
