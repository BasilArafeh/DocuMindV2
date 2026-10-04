"use client";

import { IconUpload } from "@tabler/icons-react";
import { BrandMark } from "./BrandMark";

const STARTERS = [
  "What is this document about?",
  "What are the key claims?",
  "What should I know first?",
];

export function EmptyState({
  hasDocuments,
  documentCount,
  onUpload,
  onAsk,
  suggestions = [],
  loadingSuggestions = false,
}: {
  hasDocuments: boolean;
  documentCount: number;
  onUpload: () => void;
  onAsk: (question: string) => void;
  suggestions?: string[];
  loadingSuggestions?: boolean;
}) {
  if (!hasDocuments) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <BrandMark size={48} />
        <h1
          className="mt-5 max-w-md text-[24px] leading-tight text-[var(--ink)]"
          style={{ fontFamily: "Georgia, Times New Roman, serif" }}
        >
          Ask your documents anything.
        </h1>
        <p className="mt-2 max-w-sm text-[14px] text-[var(--ink-muted)]">
          Every answer comes with the passages it came from.
        </p>
        <button
          type="button"
          onClick={onUpload}
          className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-[var(--orange)] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[var(--orange-hover)]"
        >
          <IconUpload size={16} stroke={2} />
          Upload a PDF
        </button>
        <p className="mt-2 text-[11px] text-[var(--ink-muted)]">PDF only · up to 25 MB</p>
      </div>
    );
  }

  const chips =
    suggestions.length > 0 ? suggestions : loadingSuggestions ? [] : STARTERS;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <BrandMark size={48} />
      <h1
        className="mt-5 max-w-md text-[24px] leading-tight text-[var(--ink)]"
        style={{ fontFamily: "Georgia, Times New Roman, serif" }}
      >
        Ready when you are.
      </h1>
      <p className="mt-2 max-w-sm text-[14px] text-[var(--ink-muted)]">
        {documentCount} document{documentCount === 1 ? "" : "s"} indexed. Start by asking a
        question.
      </p>
      <div className="mt-6 flex max-w-md flex-wrap justify-center gap-2">
        {loadingSuggestions
          ? [0, 1, 2].map((index) => (
              <span
                key={index}
                className="animate-pulse px-3 py-1.5 text-[12px]"
                style={{
                  background: "#E8E4DC",
                  borderRadius: 20,
                  minWidth: 140,
                  height: 30,
                }}
                aria-hidden="true"
              />
            ))
          : chips.map((starter, index) => (
              <button
                key={starter}
                type="button"
                onClick={() => onAsk(starter)}
                className="followup-enter rounded-full border border-[var(--border)] bg-[var(--bg-page)] px-3 py-1.5 text-[12px] text-[var(--ink-soft)] hover:border-[var(--orange-border)] hover:bg-[var(--orange-bg)]"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {starter}
              </button>
            ))}
      </div>
    </div>
  );
}
