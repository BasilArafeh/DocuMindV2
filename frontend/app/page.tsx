"use client";

import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";

const BASE_URL = "/api";
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type DocumentItem = {
  docId: string;
  filename: string;
  chunksCreated: number;
  fileSizeMb?: number;
};

type Citation = {
  filename: string;
  chunkIndex: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: string;
  streaming?: boolean;
};

function createId() {
  return crypto.randomUUID();
}

function isPdf(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const parts = detail.map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return String(item);
      });
      if (parts.length) return parts.join(" ");
    }
  }
  return fallback;
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return apiErrorMessage(payload, fallback);
}

function normalizeCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const filename =
      typeof record.filename === "string"
        ? record.filename
        : typeof record.source === "string"
          ? record.source
          : "Untitled source";
    const chunkIndex =
      typeof record.chunk_index === "number"
        ? record.chunk_index
        : typeof record.chunkIndex === "number"
          ? record.chunkIndex
          : 0;
    const key = `${filename}:${chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ filename, chunkIndex });
  }

  return citations;
}

async function streamChat(
  sessionId: string,
  question: string,
  onToken: (token: string) => void,
  onCitations: (citations: Citation[]) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": sessionId,
    },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readError(response, `Chat failed (${response.status})`));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("The chat stream could not be opened.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";

  const consumeLine = (line: string) => {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed) {
      eventType = "";
      return;
    }
    if (trimmed.startsWith("event:")) {
      eventType = trimmed.slice(6).trim();
      return;
    }
    if (!trimmed.startsWith("data:")) return;

    const raw = trimmed.slice(5).trim();
    if (!raw || raw === "[DONE]") return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventType === "error") {
      const message =
        typeof payload.message === "string"
          ? payload.message
          : "The assistant could not complete that answer.";
      throw new Error(message);
    }

    if (typeof payload.token === "string") {
      onToken(payload.token);
    } else if (typeof payload.content === "string" && eventType !== "citations") {
      onToken(payload.content);
    }

    if (Array.isArray(payload.citations)) {
      onCitations(normalizeCitations(payload.citations));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  }

  if (buffer.trim()) consumeLine(buffer);
}

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute top-0 right-[5px] bottom-[5px] left-0 rounded-[7px] bg-ink" />
      <span className="absolute top-[5px] right-0 bottom-0 left-[5px] rounded-[7px] bg-amber shadow-[0_1px_2px_rgba(33,30,23,0.18)]" />
    </span>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`font-display tracking-tight ${compact ? "text-lg" : "text-xl"}`}>
      <span className="font-semibold text-ink-deep">Docu</span>
      <span className="font-normal text-slate-blue">Mind</span>
    </span>
  );
}

function PdfGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <path
        d="M7 3.5h6.2L18.5 9v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M13.2 3.6V8.2h5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SendGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M5 12h12M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function renderAnswer(text: string) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, index) =>
    /^\[\d+\]$/.test(part) ? (
      <span key={`${part}-${index}`} className="font-display font-medium text-amber">
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function formatInline(children: ReactNode) {
  return (
    <>
      {Children.map(children, (child) =>
        typeof child === "string" ? renderAnswer(child) : child,
      )}
    </>
  );
}

const answerMarkdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{formatInline(children)}</p>,
  strong: ({ children }) => (
    <strong className="font-medium">{formatInline(children)}</strong>
  ),
  em: ({ children }) => <em className="italic">{formatInline(children)}</em>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-6 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-6 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{formatInline(children)}</li>,
};

export default function Home() {
  const [sessionId] = useState(() => createId());
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeDocument = documents.find((doc) => doc.docId === activeDocId) ?? null;
  const messages = useMemo(
    () => (activeDocId ? (threads[activeDocId] ?? []) : []),
    [activeDocId, threads],
  );
  const streaming = messages.some((message) => message.streaming);
  const canChat = Boolean(sessionId && activeDocument && !uploading && !streaming);
  const lastMessage = messages.at(-1);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, lastMessage?.content, lastMessage?.streaming]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [question]);

  const updateThread = useCallback(
    (docId: string, updater: (current: ChatMessage[]) => ChatMessage[]) => {
      setThreads((current) => ({
        ...current,
        [docId]: updater(current[docId] ?? []),
      }));
    },
    [],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!sessionId) return;
      const files = Array.from(fileList);
      if (!files.length) return;

      setUploadError(null);
      setUploading(true);

      try {
        for (const file of files) {
          if (!isPdf(file)) {
            throw new Error("Only PDF files can be uploaded.");
          }
          if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new Error(`“${file.name}” is larger than ${MAX_FILE_SIZE_MB} MB.`);
          }

          const body = new FormData();
          body.append("file", file);

          const response = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "X-Session-ID": sessionId },
            body,
          });

          if (!response.ok) {
            throw new Error(
              await readError(response, `Could not upload “${file.name}”.`),
            );
          }

          const payload = (await response.json()) as {
            doc_id: string;
            filename: string;
            chunks_created: number;
            file_size_mb?: number;
          };

          const nextDoc: DocumentItem = {
            docId: payload.doc_id,
            filename: payload.filename || file.name,
            chunksCreated: payload.chunks_created,
            fileSizeMb: payload.file_size_mb,
          };

          setDocuments((current) => {
            const without = current.filter((doc) => doc.docId !== nextDoc.docId);
            return [nextDoc, ...without];
          });
          setActiveDocId(nextDoc.docId);
          setThreads((current) =>
            current[nextDoc.docId] ? current : { ...current, [nextDoc.docId]: [] },
          );
          setSidebarOpen(false);
        }
      } catch (error) {
        setUploadError(
          error instanceof Error ? error.message : "Upload failed. Please try again.",
        );
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [sessionId],
  );

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length) {
      void handleFiles(event.dataTransfer.files);
    }
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const deleteDocument = async (docId: string) => {
    if (!sessionId || busyDocId) return;
    setBusyDocId(docId);
    setUploadError(null);

    try {
      const response = await fetch(`${BASE_URL}/documents/${docId}`, {
        method: "DELETE",
        headers: { "X-Session-ID": sessionId },
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(await readError(response, "Could not delete that document."));
      }

      abortRef.current?.abort();
      const remaining = documents.filter((doc) => doc.docId !== docId);
      setDocuments(remaining);
      setActiveDocId((active) =>
        active === docId ? (remaining[0]?.docId ?? null) : active,
      );
      setThreads((current) => {
        const next = { ...current };
        delete next[docId];
        return next;
      });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Could not delete that document.",
      );
    } finally {
      setBusyDocId(null);
    }
  };

  const sendQuestion = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !sessionId || !activeDocId || streaming) return;

    const docId = activeDocId;
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
    };
    const assistantId = createId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setQuestion("");
    updateThread(docId, (current) => [...current, userMessage, assistantMessage]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        sessionId,
        trimmed,
        (token) => {
          updateThread(docId, (current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + token }
                : message,
            ),
          );
        },
        (citations) => {
          updateThread(docId, (current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, citations } : message,
            ),
          );
        },
        controller.signal,
      );

      updateThread(docId, (current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                streaming: false,
                content:
                  message.content.trim() ||
                  "I could not find an answer in the uploaded documents.",
              }
            : message,
        ),
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Something went wrong while answering.";
      updateThread(docId, (current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                streaming: false,
                error: message,
                content: item.content,
              }
            : item,
        ),
      );
    }
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  };

  const placeholder = useMemo(() => {
    if (!documents.length) return "Upload a PDF to start asking questions";
    if (!activeDocument) return "Select a document to ask a question";
    return `Ask ${activeDocument.filename} anything…`;
  }, [activeDocument, documents.length]);

  return (
    <div
      className="h-dvh p-2.5 sm:p-3.5"
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="mx-auto flex h-full max-w-[1440px] gap-3">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-ink/25 lg:hidden"
            aria-label="Close documents"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed inset-y-3 left-3 z-30 flex w-[min(20.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-rule bg-sidebar shadow-[0_12px_40px_rgba(33,30,23,0.12)] transition-transform duration-200 lg:static lg:z-0 lg:h-full lg:w-[20.5rem] lg:translate-x-0 lg:shadow-[0_1px_2px_rgba(33,30,23,0.04),0_10px_28px_rgba(33,30,23,0.05)] ${
            sidebarOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0"
          }`}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <LogoMark />
              <div>
                <Wordmark />
                <p className="mt-0.5 font-display text-[11px] font-medium tracking-[0.16em] text-slate-blue uppercase">
                  Document assistant
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>

          <div className="px-5 pb-3">
            <div className="flex items-end justify-between">
              <h2 className="font-display text-[11px] font-medium tracking-[0.18em] text-muted uppercase">
                Documents
              </h2>
              <span className="font-display text-[11px] text-slate-blue">
                {documents.length || "None"}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scroll-editorial">
            {documents.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !sessionId}
                className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#cfc6b4] bg-[#f7f3ea] px-4 py-10 text-center transition hover:border-ink/30 hover:bg-[#faf6ee] disabled:opacity-60"
              >
                <span className="mb-3 text-ink/70">
                  <PdfGlyph />
                </span>
                <p className="font-display text-sm font-medium text-ink-deep">Drop a PDF here</p>
                <p className="mt-1 max-w-[14rem] text-[13px] leading-5 text-muted">
                  or click to upload. Each file is indexed into passages you can ask about.
                </p>
              </button>
            ) : (
              <ul className="space-y-1.5">
                {documents.map((doc) => {
                  const selected = doc.docId === activeDocId;
                  return (
                    <li key={doc.docId}>
                      <div
                        className={`group flex items-start gap-2.5 rounded-xl border px-2.5 py-2.5 transition ${
                          selected
                            ? "border-ink/15 bg-panel shadow-[0_1px_2px_rgba(33,30,23,0.06)]"
                            : "border-transparent hover:border-rule hover:bg-[#f7f3ea]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDocId(doc.docId);
                            setSidebarOpen(false);
                          }}
                          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                        >
                          <span
                            className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${
                              selected ? "bg-ink text-panel" : "bg-[#e4ddd0] text-ink"
                            }`}
                          >
                            <PdfGlyph />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-display text-[13.5px] font-medium text-ink-deep">
                              {doc.filename}
                            </span>
                            <span className="mt-0.5 block text-[12px] text-muted">
                              {doc.chunksCreated} passage{doc.chunksCreated === 1 ? "" : "s"}
                              {typeof doc.fileSizeMb === "number"
                                ? ` · ${doc.fileSizeMb} MB`
                                : ""}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${doc.filename}`}
                          disabled={busyDocId === doc.docId}
                          onClick={() => void deleteDocument(doc.docId)}
                          className="rounded-md px-1.5 py-1 text-[15px] leading-none text-muted opacity-0 transition hover:bg-[#e8e0d2] hover:text-ink group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-rule/80 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void handleFiles(event.target.files);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !sessionId}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 font-display text-sm font-medium text-panel transition hover:bg-[#1c2e4a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Indexing PDF…" : "Upload PDF"}
            </button>
            {uploadError ? (
              <p className="mt-2.5 text-[12.5px] leading-5 text-[#9a4a32]">{uploadError}</p>
            ) : (
              <p className="mt-2.5 text-center text-[11.5px] text-muted">
                PDF only · up to {MAX_FILE_SIZE_MB} MB
              </p>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-rule bg-panel shadow-[0_1px_2px_rgba(33,30,23,0.04),0_10px_28px_rgba(33,30,23,0.05)]">
          <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="rounded-lg border border-rule px-2.5 py-1.5 text-sm text-ink lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open documents"
              >
                Docs
              </button>
              <div className="min-w-0">
                <p className="truncate font-serif text-[17px] text-ink-deep">
                  {activeDocument ? activeDocument.filename : "Your reading desk"}
                </p>
                <p className="truncate font-display text-[11px] tracking-[0.08em] text-slate-blue uppercase">
                  {documents.length
                    ? `Asking across ${documents.length} document${documents.length === 1 ? "" : "s"}`
                    : "Upload a PDF to begin"}
                </p>
              </div>
            </div>
            <LogoMark size={22} />
          </header>

          <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 scroll-editorial">
            {messages.length === 0 ? (
              <EmptyState hasDocuments={documents.length > 0} />
            ) : (
              <div className="mx-auto flex max-w-[42rem] flex-col gap-6">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[14.5px] leading-6 text-panel">
                        <p className="whitespace-pre-wrap" dir="auto">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="max-w-[42rem]">
                      <p className="mb-2 font-display text-[11px] font-medium tracking-[0.16em] text-slate-blue uppercase">
                        Answer
                      </p>
                      <div
                        className="font-serif text-[18px] leading-[1.65] text-ink-deep"
                        dir="auto"
                        aria-live="polite"
                      >
                        {message.content ? (
                          <ReactMarkdown components={answerMarkdownComponents}>
                            {message.content}
                          </ReactMarkdown>
                        ) : message.streaming ? (
                          <span className="text-muted italic">Reading the passages…</span>
                        ) : null}
                        {message.streaming ? (
                          <span
                            className="caret-blink ml-0.5 inline-block h-[1.05em] w-[0.08em] translate-y-[0.12em] bg-amber align-baseline"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      {message.error ? (
                        <p className="mt-3 rounded-lg border border-[#e4c7bc] bg-[#f8eee9] px-3 py-2 text-sm text-[#9a4a32]">
                          {message.error}
                        </p>
                      ) : null}
                      {!message.streaming && message.citations?.length ? (
                        <SourcesCard citations={message.citations} />
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <form onSubmit={(event) => void sendQuestion(event)} className="border-t border-rule p-3 sm:p-4">
            <div className="mx-auto flex max-w-[42rem] items-end gap-2 rounded-2xl border border-rule bg-[#f7f4ec] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={1}
                placeholder={placeholder}
                disabled={!canChat}
                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[14.5px] leading-6 text-ink-deep outline-none placeholder:text-muted/80 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!canChat || !question.trim()}
                aria-label="Send question"
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-panel transition hover:bg-[#1c2e4a] disabled:cursor-not-allowed disabled:bg-[#c5bdae]"
              >
                <SendGlyph />
              </button>
            </div>
            <p className="mx-auto mt-2 max-w-[42rem] text-center text-[11.5px] text-muted">
              Enter to send · Shift+Enter for a new line
            </p>
          </form>
        </main>
      </div>

      {dragging ? (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-ink/40 bg-panel/80 backdrop-blur-[2px]">
          <div className="text-center">
            <p className="font-serif text-3xl text-ink-deep">Drop to index</p>
            <p className="mt-1 font-display text-sm tracking-[0.12em] text-slate-blue uppercase">
              PDF documents only
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ hasDocuments }: { hasDocuments: boolean }) {
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <LogoMark size={36} />
      <h1 className="mt-6 font-serif text-[2.1rem] leading-tight text-ink-deep sm:text-[2.35rem]">
        Ask your documents anything.
      </h1>
      <p className="mt-3 font-serif text-[17px] leading-7 text-muted italic">
        Every answer arrives with the passages it came from.
      </p>
      <p className="mt-6 max-w-sm text-[13.5px] leading-6 text-muted">
        {hasDocuments
          ? "Choose a question in your own words. DocuMind will search the indexed passages and cite what it used."
          : "Start by uploading a PDF on the left — or drop one anywhere on this desk."}
      </p>
    </div>
  );
}

function SourcesCard({ citations }: { citations: Citation[] }) {
  return (
    <aside className="mt-4 rounded-xl border border-amber/25 bg-[rgba(185,138,62,0.08)] px-4 py-3">
      <p className="font-display text-[11px] font-medium tracking-[0.18em] text-amber uppercase">
        Sources
      </p>
      <ol className="mt-2 space-y-1.5">
        {citations.map((citation, index) => (
          <li
            key={`${citation.filename}-${citation.chunkIndex}-${index}`}
            className="flex items-baseline gap-2 text-[13px] leading-5 text-ink"
          >
            <span className="font-display font-medium text-amber">[{index + 1}]</span>
            <span className="min-w-0 truncate">{citation.filename}</span>
            <span className="shrink-0 text-muted">passage {citation.chunkIndex + 1}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
