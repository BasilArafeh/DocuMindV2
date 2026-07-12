"""chat.py — Document chat routes with SSE streaming."""



import asyncio

import json

from collections.abc import AsyncIterator

from dataclasses import asdict



from fastapi import APIRouter, Depends, Request

from fastapi.responses import StreamingResponse



from app.core.logging import get_logger
from app.dependencies import get_llm_service, get_retriever, get_session_id
from app.middleware.rate_limiter import limiter

from app.models.schemas import ChatRequest

from app.prompts.templates import prepare_prompt_context

from app.services.llm import LLMError, OpenAILLMService, build_citations

from app.services.retriever import Retriever, RetrieverError, RetrievedChunk



logger = get_logger(__name__)



router = APIRouter(tags=["chat"])





def _format_sse_event(event: str, payload: dict) -> str:

    """Format a Server-Sent Event message."""

    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"





def _citations_payload(chunks: list[RetrievedChunk]) -> list[dict[str, str | int]]:

    """Build citation payloads for SSE events."""

    return [asdict(citation) for citation in build_citations(chunks)]





async def _stream_chat_events(

    retriever: Retriever,

    llm: OpenAILLMService,

    session_id: str,

    question: str,

) -> AsyncIterator[str]:

    """Orchestrate retrieval and LLM streaming as SSE events."""

    try:

        chunks = await retriever.retrieve(question, session_id=session_id)

    except RetrieverError as exc:

        logger.error("Chat retrieval failed session_id=%s: %s", session_id, exc)

        yield _format_sse_event(

            "error",

            {"message": "Failed to retrieve relevant document context."},

        )

        return



    if not chunks:

        yield _format_sse_event(

            "error",

            {"message": "No relevant context found for the selected documents."},

        )

        return



    included_chunks, _ = prepare_prompt_context(chunks)



    try:

        async for token in llm.stream_answer(question, chunks):

            yield _format_sse_event("token", {"content": token})

    except LLMError as exc:

        logger.error("Chat generation failed session_id=%s: %s", session_id, exc)

        yield _format_sse_event(

            "error",

            {"message": str(exc)},

        )

        return



    yield _format_sse_event(

        "citations",

        {"citations": _citations_payload(included_chunks)},

    )

    yield _format_sse_event("done", {})





@router.post("/chat", response_class=StreamingResponse, response_model=None)
@limiter.limit("20/minute")
async def chat_with_documents(

    request: Request,

    body: ChatRequest,

    session_id: str = Depends(get_session_id),

    retriever: Retriever = Depends(get_retriever),

    llm: OpenAILLMService = Depends(get_llm_service),

):

    """Ask a question against selected documents and stream the answer."""

    logger.info(

        "Received chat request session_id=%s",

        session_id,

    )



    async def event_generator() -> AsyncIterator[str]:

        try:

            async for event in _stream_chat_events(

                retriever,

                llm,

                session_id,

                body.question,

            ):

                if await request.is_disconnected():

                    logger.info(

                        "Client disconnected from chat stream session_id=%s",

                        session_id,

                    )

                    break

                yield event

        except asyncio.CancelledError:

            logger.info("Chat stream cancelled session_id=%s", session_id)

            raise



    return StreamingResponse(

        event_generator(),

        media_type="text/event-stream",

        headers={

            "Cache-Control": "no-cache",

            "Connection": "keep-alive",

            "X-Accel-Buffering": "no",

        },

    )

