"use client";

import { IconPlus, IconUpload } from "@tabler/icons-react";
import type { Citation, DocumentItem } from "@/lib/types";
import { HistoryList, type HistoryItem } from "@/components/ui/HistoryList";
import { BrandMark } from "@/components/ui/BrandMark";
import { CoverageCard } from "./CoverageCard";
import { DocRow } from "./DocRow";
import { Wordmark } from "./Wordmark";

export function Sidebar({
  documents,
  citations,
  activeFilename,
  uploading,
  uploadError,
  busyDocId,
  dragging,
  history,
  questionActive,
  onSelectDoc,
  onDeleteDoc,
  onUploadClick,
  onNewQuestion,
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
  onSelectDoc: (doc: DocumentItem) => void;
  onDeleteDoc: (docId: string) => void;
  onUploadClick: () => void;
  onNewQuestion: () => void;
  onSelectHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
}) {
  const citesByName = new Map<string, number>();
  for (const citation of citations) {
    citesByName.set(citation.filename, (citesByName.get(citation.filename) ?? 0) + 1);
  }
  const citedCount = citesByName.size;
  const bars = documents.map((doc) => citesByName.get(doc.filename) ?? 0);

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--bg-sidebar)] px-3.5 py-4 text-white lg:w-[260px]">
      <div className="flex items-center gap-2.5 px-1">
        <BrandMark size={28} />
        <Wordmark />
      </div>

      <button
        type="button"
        onClick={onNewQuestion}
        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2E2A26] bg-[#1C1A18] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#252220]"
      >
        <IconPlus size={15} stroke={2} />
        New question
      </button>

      <HistoryList items={history} onSelect={onSelectHistory} onDelete={onDeleteHistory} />

      {questionActive && documents.length > 0 ? (
        <>
          <p
            className="mt-6 px-1 uppercase"
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "#6B7280",
            }}
          >
            Sources · {documents.length}
          </p>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto scroll-sidebar">
            {documents.map((doc) => (
              <DocRow
                key={doc.docId}
                name={doc.filename}
                passages={doc.chunksCreated}
                cites={citesByName.get(doc.filename) ?? 0}
                selected={activeFilename === doc.filename}
                deleting={busyDocId === doc.docId}
                onSelect={() => onSelectDoc(doc)}
                onDelete={() => onDeleteDoc(doc.docId)}
              />
            ))}

            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploading}
              className={`mt-2 flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center text-[12px] transition ${
                dragging
                  ? "border-[var(--orange)] text-[var(--orange)]"
                  : "border-[var(--sidebar-line)] text-[var(--sidebar-muted)] hover:border-[var(--orange)] hover:text-[var(--sidebar-dim)]"
              }`}
            >
              <IconUpload size={16} stroke={1.8} />
              {uploading ? "Indexing…" : "Drop a PDF to add"}
            </button>
            {uploadError ? (
              <p className="mt-2 px-1 text-[11px] leading-4 text-[var(--sidebar-dim)]">{uploadError}</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1">
          {documents.length > 0 ? (
            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploading}
              className={`mt-6 flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center text-[12px] transition ${
                dragging
                  ? "border-[var(--orange)] text-[var(--orange)]"
                  : "border-[var(--sidebar-line)] text-[var(--sidebar-muted)] hover:border-[var(--orange)] hover:text-[var(--sidebar-dim)]"
              }`}
            >
              <IconUpload size={16} stroke={1.8} />
              {uploading ? "Indexing…" : "Drop a PDF to add"}
            </button>
          ) : null}
          {uploadError ? (
            <p className="mt-6 px-1 text-[11px] leading-4 text-[var(--sidebar-dim)]">{uploadError}</p>
          ) : null}
        </div>
      )}

      {questionActive ? (
        <CoverageCard cited={citedCount} total={documents.length} bars={bars} />
      ) : null}
    </aside>
  );
}
