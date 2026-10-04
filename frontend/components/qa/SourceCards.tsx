"use client";

import { useState } from "react";
import { cleanDisplayFilename } from "@/lib/filename";
import type { Citation } from "@/lib/types";

function truncateFilename(name: string, max = 30) {
  const cleaned = cleanDisplayFilename(name);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function SourceRow({
  citation,
  isLast,
}: {
  citation: Citation;
  isLast: boolean;
}) {
  const passage = citation.chunkIndex + 1;

  return (
    <div
      className="source-enter"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderBottom: isLast ? "none" : "0.5px solid #EDEAE2",
        fontSize: 13,
        color: "#4A4A4A",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: 20,
          height: 20,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 5,
          background: "#F26419",
          color: "#FFFFFF",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {citation.n}
      </span>
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {truncateFilename(citation.filename)}
      </span>
      <span aria-hidden="true">·</span>
      <span style={{ flexShrink: 0 }}>Passage {passage}</span>
    </div>
  );
}

const PREVIEW_COUNT = 2;

export function SourceCards({ citations }: { citations: Citation[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!citations.length) return null;

  const hasMore = citations.length > PREVIEW_COUNT;
  const visible = expanded || !hasMore ? citations : citations.slice(0, PREVIEW_COUNT);
  const moreCount = citations.length - PREVIEW_COUNT;

  return (
    <div style={{ marginTop: 24 }}>
      <p
        style={{
          marginBottom: 12,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#8A8A8A",
        }}
      >
        Sources
      </p>
      {visible.map((citation, index) => (
        <SourceRow
          key={`${citation.n}-${citation.chunkId ?? citation.chunkIndex}`}
          citation={citation}
          isLast={index === visible.length - 1}
        />
      ))}
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{
            color: "#F26419",
            fontSize: 13,
            fontWeight: 500,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px 0",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          }}
        >
          {expanded ? "Show less" : `Show ${moreCount} more sources`}
        </button>
      ) : null}
    </div>
  );
}
