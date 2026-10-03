"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { IconMenu2 } from "@tabler/icons-react";
import {
  BASE_URL,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  createId,
  isPdf,
  readError,
  streamChat,
} from "@/lib/api";
import type { ChatMessage, Citation, DocumentItem } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { FollowUpChips } from "@/components/ui/FollowUpChips";
import type { HistoryItem } from "@/components/ui/HistoryList";
import { Answer } from "./Answer";
import { Composer } from "./Composer";
import { EvidenceStage } from "./EvidenceStage";
import { Message } from "./Message";
import { Sidebar } from "./Sidebar";
import { TetherProvider, useTether } from "./Tether";

function gapFromError(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("no relevant") ||
    lower.includes("not found") ||
    lower.includes("not in")
  ) {
    return "Not in your documents. Nothing retrieved supports this question.";
  }
  return null;
}

function ConversationBody({
  messages,
  documents,
  focusedMessageId,
  onUpload,
  onAsk,
}: {
  messages: ChatMessage[];
  documents: DocumentItem[];
  focusedMessageId: string | null;
  onUpload: () => void;
  onAsk: (question: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);
  const lastAssistantDone =
    last?.role === "assistant" && !last.streaming && Boolean(last.content) && !last.error;

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, last?.content, last?.streaming]);

  useEffect(() => {
    if (!focusedMessageId) return;
    const node = scrollerRef.current?.querySelector(`[data-msg="${focusedMessageId}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusedMessageId]);

  return (
    <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto scroll-quiet">
      {messages.length === 0 ? (
        <EmptyState
          hasDocuments={documents.length > 0}
          documentCount={documents.length}
          onUpload={onUpload}
          onAsk={onAsk}
        />
      ) : (
        <div
          className="mx-auto flex w-full flex-col"
          style={{ padding: "32px 48px", maxWidth: 780 }}
        >
          {messages.map((message) => {
            if (message.role === "user") {
              return (
                <Message key={message.id} id={message.id}>
                  {message.content}
                </Message>
              );
            }
            return (
              <div key={message.id}>
                <Answer
                  content={message.content}
                  citations={message.citations}
                  streaming={message.streaming}
                  error={message.error}
                  gap={message.gap}
                />
              </div>
            );
          })}
          {lastAssistantDone ? <FollowUpChips onAsk={onAsk} /> : null}
        </div>
      )}
    </div>
  );
}

function SidebarPane({
  documents,
  citations,
  activeFilename,
  uploading,
  uploadError,
  busyDocId,
  dragging,
  history,
  questionActive,
  onDeleteDoc,
  onUploadClick,
  onNewQuestion,
  onPickedDoc,
  onSelectHistory,
  onDeleteHistory,
}: {
  documents: DocumentItem[];
  citations: Citation[];
  activeFilename: string | null;
  uploading: boolean;
  uploadError: string | null;
  busyDocId: string | null;
  dragging: boolean;
  history: HistoryItem[];
  questionActive: boolean;
  onDeleteDoc: (docId: string) => void;
  onUploadClick: () => void;
  onNewQuestion: () => void;
  onPickedDoc: (doc: DocumentItem) => void;
  onSelectHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
}) {
  const tether = useTether();

  return (
    <Sidebar
      documents={documents}
      citations={citations}
      activeFilename={activeFilename}
      uploading={uploading}
      uploadError={uploadError}
      busyDocId={busyDocId}
      dragging={dragging}
      history={history}
      questionActive={questionActive}
      onSelectDoc={(doc) => {
        const match = citations.find((item) => item.filename === doc.filename);
        if (match) tether?.selectN(match.n);
        onPickedDoc(doc);
      }}
      onDeleteDoc={onDeleteDoc}
      onUploadClick={onUploadClick}
      onNewQuestion={onNewQuestion}
      onSelectHistory={onSelectHistory}
      onDeleteHistory={onDeleteHistory}
    />
  );
}

export function QaScreen() {
  const [sessionId] = useState(() => createId());
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const streaming = messages.some((message) => message.streaming);
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const citations = lastAssistant?.citations ?? [];
  const canChat = Boolean(sessionId && documents.length && !uploading && !streaming);
  const activeFilename =
    selectedFilename ?? citations[0]?.filename ?? documents[0]?.filename ?? null;

  const history = useMemo<HistoryItem[]>(() => {
    const users = messages.filter((message) => message.role === "user");
    const currentId = focusedMessageId ?? users.at(-1)?.id;
    return users.map((message) => ({
      id: message.id,
      question: message.content,
      active: message.id === currentId,
    }));
  }, [messages, focusedMessageId]);

  const activeQuestion = history.find((item) => item.active)?.question ?? null;
  const sourceCount = citations.length
    ? new Set(citations.map((item) => item.filename)).size
    : documents.length;

  const openEvidence = useCallback(() => {
    setEvidenceOpen(true);
  }, []);

  const closeEvidence = useCallback(() => {
    setEvidenceOpen(false);
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [question]);

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
            throw new Error(await readError(response, `Could not upload “${file.name}”.`));
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
          setSelectedFilename(nextDoc.filename);
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

      setDocuments((current) => {
        const remaining = current.filter((doc) => doc.docId !== docId);
        const removed = current.find((doc) => doc.docId === docId);
        if (removed && selectedFilename === removed.filename) {
          setSelectedFilename(remaining[0]?.filename ?? null);
        }
        return remaining;
      });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Could not delete that document.",
      );
    } finally {
      setBusyDocId(null);
    }
  };

  const sendQuestion = async (text?: string) => {
    const trimmed = (text ?? question).trim();
    if (!trimmed || !sessionId || streaming || !documents.length) return;

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
    setFocusedMessageId(userMessage.id);
    setMessages((current) => [...current, userMessage, assistantMessage]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const patchAssistant = (partial: Partial<ChatMessage>) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, ...partial } : message,
        ),
      );
    };

    try {
      await streamChat(
        sessionId,
        trimmed,
        {
          onToken: (token) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + token }
                  : message,
              ),
            );
          },
          onCitations: (nextCitations) => {
            patchAssistant({ citations: nextCitations });
          },
          onStatus: (retrieval) => {
            patchAssistant({ retrieval });
          },
        },
        controller.signal,
      );

      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          const content =
            message.content.trim() ||
            "I could not find an answer in the uploaded documents.";
          const gap = !message.content.trim()
            ? "Not in your documents. The retrieved passages do not contain an answer."
            : message.gap;
          return { ...message, streaming: false, content, gap };
        }),
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Something went wrong while answering.";
      const gap = gapFromError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                streaming: false,
                error: gap ? undefined : message,
                gap: gap ?? item.gap,
                content: item.content,
              }
            : item,
        ),
      );
    }
  };

  const deleteHistory = (id: string) => {
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === id);
      if (index < 0) return current;
      const next = current.slice();
      const removeCount = next[index + 1]?.role === "assistant" ? 2 : 1;
      next.splice(index, removeCount);
      return next;
    });
    setFocusedMessageId((current) => (current === id ? null : current));
  };

  const placeholder = documents.length
    ? `Ask across ${documents.length} document${documents.length === 1 ? "" : "s"}…`
    : "Upload a PDF to start asking questions";

  return (
    <TetherProvider
      key={lastAssistant?.id ?? "empty"}
      citationCount={citations.length}
      onSelect={openEvidence}
    >
      <div
        className="flex h-dvh bg-[var(--bg-page)]"
        onDragEnter={onDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
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

        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-[var(--ink)]/40 lg:hidden"
            aria-label="Close sources"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <div
          className={`fixed inset-x-0 bottom-0 z-30 h-[min(88dvh,100%)] overflow-hidden transition-transform duration-200 max-lg:rounded-t-2xl lg:static lg:inset-auto lg:z-0 lg:h-full lg:w-[260px] lg:translate-y-0 lg:rounded-none ${
            sidebarOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0"
          }`}
        >
          <SidebarPane
            documents={documents}
            citations={citations}
            activeFilename={activeFilename}
            uploading={uploading}
            uploadError={uploadError}
            busyDocId={busyDocId}
            dragging={dragging}
            history={history}
            questionActive={Boolean(activeQuestion)}
            onDeleteDoc={(docId) => void deleteDocument(docId)}
            onUploadClick={() => fileInputRef.current?.click()}
            onNewQuestion={() => {
              abortRef.current?.abort();
              setMessages([]);
              setQuestion("");
              setEvidenceOpen(false);
              setFocusedMessageId(null);
            }}
            onPickedDoc={(doc) => {
              setSelectedFilename(doc.filename);
              setSidebarOpen(false);
            }}
            onSelectHistory={(id) => {
              setFocusedMessageId(id);
              setSidebarOpen(false);
            }}
            onDeleteHistory={deleteHistory}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col rounded-none">
          <div
            className="flex min-h-0 flex-1 overflow-hidden border-0 bg-[var(--bg-page)]"
            style={{ borderRadius: 0 }}
          >
            <section className="flex min-w-0 flex-1 flex-col">
              <header
                className="flex h-[54px] shrink-0 items-center justify-between gap-3 px-4"
                style={{ borderBottom: activeQuestion ? "1px solid #EDEAE2" : undefined }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--ink)] lg:hidden"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Open sources"
                  >
                    <IconMenu2 size={16} stroke={1.8} />
                  </button>
                  {activeQuestion ? (
                    <>
                      <p
                        className="truncate"
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "#1A1A1A",
                          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        }}
                      >
                        {activeQuestion}
                      </p>
                      {sourceCount > 0 ? (
                        <span
                          className="inline-flex shrink-0 items-center"
                          style={{
                            background: "#FEF0E7",
                            color: "#F26419",
                            border: "1px solid #F9C9A8",
                            borderRadius: 20,
                            fontSize: 11,
                            padding: "2px 10px",
                            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                          }}
                        >
                          {sourceCount} {sourceCount === 1 ? "source" : "sources"}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
                {activeQuestion ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      style={{
                        border: "1px solid #E4E0D8",
                        borderRadius: 8,
                        fontSize: 13,
                        color: "#4A4A4A",
                        padding: "6px 14px",
                        background: "transparent",
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      style={{
                        border: "1px solid #E4E0D8",
                        borderRadius: 8,
                        fontSize: 13,
                        color: "#4A4A4A",
                        padding: "6px 14px",
                        background: "transparent",
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      Export
                    </button>
                  </div>
                ) : null}
              </header>
              <ConversationBody
                messages={messages}
                documents={documents}
                focusedMessageId={focusedMessageId}
                onUpload={() => fileInputRef.current?.click()}
                onAsk={(text) => void sendQuestion(text)}
              />
              <Composer
                value={question}
                onChange={setQuestion}
                onSubmit={() => void sendQuestion()}
                placeholder={placeholder}
                disabled={!canChat}
                textareaRef={textareaRef}
              />
            </section>

            <EvidenceStage
              citations={citations}
              open={evidenceOpen}
              onOpen={openEvidence}
              onClose={closeEvidence}
              animateIn={Boolean(citations.length && !streaming)}
            />
          </div>
        </main>
      </div>
    </TetherProvider>
  );
}
