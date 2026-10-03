import type { Citation, RetrievalStatus } from "./types";

export const BASE_URL = "/api";
export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function createId() {
  return crypto.randomUUID();
}

export function isPdf(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function apiErrorMessage(payload: unknown, fallback: string) {
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

export async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return apiErrorMessage(payload, fallback);
}

export function normalizeCitations(raw: unknown): Citation[] {
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
    citations.push({
      n: citations.length + 1,
      filename,
      chunkIndex,
      chunkId:
        typeof record.chunk_id === "string"
          ? record.chunk_id
          : typeof record.chunkId === "string"
            ? record.chunkId
            : undefined,
      docId:
        typeof record.doc_id === "string"
          ? record.doc_id
          : typeof record.docId === "string"
            ? record.docId
            : undefined,
      text:
        typeof record.text === "string"
          ? record.text
          : typeof record.content === "string"
            ? record.content
            : typeof record.snippet === "string"
              ? record.snippet
              : undefined,
    });
  }

  return citations;
}

export function normalizeRetrieval(raw: unknown): RetrievalStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const documentCount =
    typeof record.document_count === "number"
      ? record.document_count
      : typeof record.documentCount === "number"
        ? record.documentCount
        : Array.isArray(record.filenames)
          ? new Set(record.filenames.filter((name) => typeof name === "string")).size
          : 0;
  const chunkCount =
    typeof record.chunk_count === "number"
      ? record.chunk_count
      : typeof record.chunkCount === "number"
        ? record.chunkCount
        : 0;
  const filenames = Array.isArray(record.filenames)
    ? record.filenames.filter((name): name is string => typeof name === "string")
    : [];
  if (!documentCount && !chunkCount && !filenames.length) return null;
  return { documentCount, chunkCount, filenames };
}

export async function streamChat(
  sessionId: string,
  question: string,
  handlers: {
    onToken: (token: string) => void;
    onCitations: (citations: Citation[]) => void;
    onStatus: (status: RetrievalStatus) => void;
  },
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

    if (eventType === "status" || eventType === "retrieval") {
      const status = normalizeRetrieval(payload);
      if (status) handlers.onStatus(status);
    }

    if (typeof payload.token === "string") {
      handlers.onToken(payload.token);
    } else if (typeof payload.content === "string" && eventType !== "citations") {
      handlers.onToken(payload.content);
    }

    if (Array.isArray(payload.citations)) {
      handlers.onCitations(normalizeCitations(payload.citations));
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
