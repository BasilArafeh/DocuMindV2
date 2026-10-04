# documind.

> Ask anything about your documents. Every answer comes with the passages it came from.

**Live demo** → [documindv2.vercel.app](https://documindv2.vercel.app)

---

## What it is

DocuMind is a RAG-powered document assistant. Upload a PDF, ask questions in plain language, and get cited answers streamed back in real time. Every claim is anchored to a specific passage and page in your document.

Built as a portfolio project to demonstrate production-grade RAG architecture — not just a wrapper around a vector store, but a system with retrieval quality improvements, answer validation, and a polished UI.

---

## Screenshots
<img width="1512" height="859" alt="image" src="https://github.com/user-attachments/assets/08950dcd-2eb7-4cb8-8e9d-ef2b50b71e18" />

<img width="1501" height="850" alt="image" src="https://github.com/user-attachments/assets/c7181fa7-fe55-4da6-9d89-655fa812e97e" />



---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js Frontend                    │
│          (Vercel) — documindv2.vercel.app                │
└───────────────────────┬─────────────────────────────────┘
                        │ SSE streaming via API proxy
┌───────────────────────▼─────────────────────────────────┐
│                   FastAPI Backend                        │
│                   (Railway)                              │
│                                                          │
│  Upload → Chunk → Embed → Pinecone                      │
│                                                          │
│  Query:                                                  │
│  1. HyDE — generate hypothetical answer                 │
│  2. Embed hypothetical answer                           │
│  3. Pinecone vector search (top-20 candidates)          │
│  4. Relevance threshold filter (0.20)                   │
│  5. Cohere rerank (top-5)                               │
│  6. GPT-4o-mini stream answer                           │
│  7. ANSWERED/DEFLECTED marker validation                │
│  8. Citations sent only if ANSWERED                     │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
    OpenAI API           Pinecone             Cohere API
```

---

## Key engineering decisions

### HyDE (Hypothetical Document Embeddings)
Standard RAG embeds the raw question and searches for similar chunks. This works well for specific questions but fails for broad ones like *"What is this document about?"* — the question embedding doesn't resemble any document chunk.

HyDE solves this by asking GPT to generate a hypothetical answer first, then embedding that instead. Since answers sound like other answers, the embedding lands in the right region of vector space and retrieval quality improves significantly for generic queries.

### Two-layer deflection system
Off-topic questions are caught at two independent layers:

1. **Retriever layer** — if no chunks score above the relevance threshold (0.20), the backend returns an error before GPT is ever called. Zero wasted tokens.
2. **GPT layer** — if chunks are retrieved but the question is genuinely off-topic (greetings, small talk, questions unrelated to the document's subject), the structured system prompt instructs GPT to append `[DEFLECTED]` to its response. Citations are withheld and the user sees a clear message.

### Structured system prompt with XML delimiters
The system prompt is structured with XML tags (`<role>`, `<core_rules>`, `<citations>`, `<answer_marker>`) rather than plain text. This gives GPT clear section boundaries and reduces instruction confusion — particularly important for the citation and deflection behavior.

### Answer marker validation
GPT appends `[ANSWERED]` or `[DEFLECTED]` at the end of every response. The backend:
- Strips the marker before sending tokens to the frontend
- Only emits a `citations` SSE event if `[ANSWERED]` was received
- Sends a `correction` event to replace the streamed text with the clean version

This means citations are never shown for answers that didn't actually use document content.

### Session isolation
Each browser session gets a UUID. All Pinecone vectors are namespaced and filtered by `session_id`, so users never see each other's documents or answers. Sessions are stateless on the backend — no database required.

### SSE streaming
Answers stream token by token via Server-Sent Events. The frontend accumulates tokens in React state, creating a typewriter effect. Citations and the correction event arrive as separate SSE events after streaming completes.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, Tailwind CSS, TypeScript |
| Backend | FastAPI (async), Python |
| LLM | GPT-4o-mini (OpenAI) |
| Embeddings | OpenAI `text-embedding-3-large` |
| Vector store | Pinecone |
| Reranking | Cohere Rerank v3.5 |
| Streaming | Server-Sent Events (SSE) |
| Frontend hosting | Vercel |
| Backend hosting | Railway (Docker) |
| CI/CD | GitHub Actions — pytest + health check |

---

## How retrieval works end to end

```
User question: "What is this document about?"
        │
        ▼
HyDE: GPT generates a hypothetical answer (~200ms)
"This document discusses artificial intelligence,
covering machine learning, neural networks..."
        │
        ▼
Embed the hypothetical answer (not the question)
        │
        ▼
Pinecone: search top-20 candidates by cosine similarity
        │
        ▼
Filter: drop any chunk below 0.20 relevance score
        │
        ▼
Cohere: rerank remaining candidates, keep top-5
        │
        ▼
Build prompt: system prompt + formatted chunks + question
        │
        ▼
GPT-4o-mini: stream answer with citation markers [1][2]
        │
        ▼
Parse [ANSWERED]/[DEFLECTED] marker
        │
        ├─ ANSWERED → send citations SSE event
        └─ DEFLECTED → withhold citations
        │
        ▼
Frontend: render streamed answer + source references
```

---

## CI/CD

GitHub Actions runs on every push to `master` affecting the backend:

1. **Test job** — installs dependencies, runs `pytest` (11 tests)
2. **Health check job** — waits 60 seconds for Railway to auto-deploy, then hits `/health` to confirm the backend is responding

Railway and Vercel both auto-deploy from `master` on push.

---

## Project structure

```
DocuMindV2/
├── backend/
│   ├── app/
│   │   ├── routers/          # FastAPI routes (upload, chat, documents, suggest)
│   │   ├── services/         # Core logic (retriever, embedder, llm, vector_store)
│   │   ├── prompts/          # System prompt and prompt builder
│   │   ├── middleware/       # Rate limiting, request ID, access logging
│   │   └── core/             # Config, logging
│   ├── tests/
│   └── Dockerfile
└── frontend/
    ├── app/                  # Next.js app router
    ├── components/
    │   ├── qa/               # Q&A specific components
    │   └── ui/               # Shared UI components
    └── lib/                  # API client, types, utilities
```

---

## What I'd add with more time

- **LangSmith tracing** — observability into retrieval quality per query
- **A/B prompt experiments** — test different system prompt versions against a benchmark
- **Scanned PDF support** — OCR fallback for image-based PDFs
- **Workspace/project grouping** — organize multiple documents into named workspaces
- **Confidence scoring** — per-claim confidence indicator based on chunk similarity scores

---

Built by [Basil Arafeh](https://github.com/BasilArafeh)
