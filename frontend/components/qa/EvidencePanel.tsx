"use client";

import { IconChevronRight } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import type { Citation } from "@/lib/types";
import { passageView } from "@/lib/passage";
import { useTether } from "./Tether";

function CitedBlock({
  citation,
  citations,
  active,
  lifted,
  animateIn,
  delay,
}: {
  citation: Citation;
  citations: Citation[];
  active: boolean;
  lifted: boolean;
  animateIn: boolean;
  delay: number;
}) {
  const { before, quote, after } = passageView(citation, citations);

  return (
    <article
      data-citation={citation.n}
      className={`px-3 py-3 transition duration-150 ${lifted ? "-translate-y-0.5" : ""} ${
        animateIn ? "source-enter" : ""
      }`}
      style={animateIn ? { animationDelay: `${delay}ms` } : undefined}
    >
      {before ? (
        <p className="mb-2 text-[13px] leading-[1.65] text-[var(--ink-muted)]">{before}</p>
      ) : null}

      <div
        className={`relative rounded-[11px] px-3.5 py-3.5 ${
          active
            ? "border-l-[3px] border-[var(--orange)] bg-[var(--orange-bg)]"
            : "border border-[var(--border)] bg-[var(--bg-surface)]"
        }`}
      >
        {active ? (
          <span className="absolute -top-2 right-3 rounded-full bg-[var(--orange)] px-2 py-[2px] text-[9px] font-bold tracking-[0.08em] text-white">
            CITED {citation.n}
          </span>
        ) : null}
        <p className="text-[13px] leading-[1.65] font-normal text-[var(--ink-soft)] italic">
          {quote || citation.text || ""}
        </p>
      </div>

      {after ? (
        <p className="mt-2 text-[13px] leading-[1.65] text-[var(--ink-muted)]">{after}</p>
      ) : null}
    </article>
  );
}

export function EvidencePanel({
  citations,
  onClose,
  variant = "docked",
  animateIn = false,
}: {
  citations: Citation[];
  onClose?: () => void;
  variant?: "docked" | "sheet";
  animateIn?: boolean;
}) {
  const tether = useTether();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const displayN = tether?.displayN ?? 1;
  const active = citations.find((item) => item.n === displayN) ?? citations[0];

  useEffect(() => {
    if (!tether) return;
    const id = window.setTimeout(() => {
      const root = scrollerRef.current;
      if (!root || root.offsetHeight === 0) return;
      const node = root.querySelector(`[data-citation="${tether.activeN}"]`);
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => window.clearTimeout(id);
  }, [tether, tether?.activeN]);

  return (
    <aside
      className={`relative flex h-full min-h-0 flex-col bg-[var(--bg-page)] ${
        variant === "docked" ? "w-[336px] shrink-0 border-l border-[var(--border)]" : "w-full"
      }`}
    >
      <header className="flex h-[54px] shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--ink)]">Evidence</p>
          <p className="truncate text-[11px] text-[var(--ink-muted)]">{active?.filename ?? ""}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {citations.map((citation) => {
            const selected = displayN === citation.n;
            return (
              <button
                key={citation.n}
                type="button"
                onMouseEnter={() => tether?.setHoveredN(citation.n)}
                onMouseLeave={() => tether?.setHoveredN(null)}
                onClick={() => tether?.selectN(citation.n)}
                className={`flex h-[22px] min-w-[22px] items-center justify-center rounded-[7px] px-1.5 text-[11px] font-bold ${
                  selected
                    ? "bg-[var(--orange)] text-white"
                    : "bg-transparent text-[var(--ink-muted)] hover:bg-[var(--border-soft)]"
                }`}
              >
                {citation.n}
              </button>
            );
          })}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="ml-0.5 rounded-[8px] p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              aria-label="Hide evidence"
            >
              <IconChevronRight size={16} stroke={1.8} />
            </button>
          ) : null}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-1 py-2 scroll-quiet">
        {citations.map((citation, index) => (
          <CitedBlock
            key={`${citation.filename}-${citation.chunkIndex}-${citation.n}`}
            citation={citation}
            citations={citations}
            active={displayN === citation.n}
            lifted={tether?.hoveredN === citation.n}
            animateIn={animateIn}
            delay={index * 80}
          />
        ))}
      </div>
    </aside>
  );
}
