"use client";

import { useState } from "react";
import type { Citation } from "@/lib/types";

function SourceCard({
  citation,
  featured,
  index,
}: {
  citation: Citation;
  featured: boolean;
  index: number;
}) {
  const quote = citation.text?.trim() || "Passage retrieved from this document.";
  const page = citation.chunkIndex + 1;

  return (
    <div
      className="source-enter"
      style={
        featured
          ? {
              background: "#FEF0E7",
              borderLeft: "3px solid #F26419",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 8,
              animationDelay: `${index * 80}ms`,
            }
          : {
              background: "#FFFFFF",
              border: "1px solid #E4E0D8",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 8,
              animationDelay: `${index * 80}ms`,
            }
      }
    >
      <span
        style={{
          display: "inline-flex",
          width: 20,
          height: 20,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 5,
          background: featured ? "#F26419" : "#F4F2EE",
          color: featured ? "#FFFFFF" : "#4A4A4A",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        {citation.n}
      </span>
      <p
        style={{
          marginTop: 6,
          fontSize: 13,
          fontStyle: "italic",
          color: "#1A1A1A",
          lineHeight: 1.6,
        }}
      >
        “{quote}”
      </p>
      <p style={{ marginTop: 4, fontSize: 11, color: "#8A8A8A" }}>
        {citation.filename} · p. {page}
      </p>
    </div>
  );
}

export function SourceCards({ citations }: { citations: Citation[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!citations.length) return null;

  const visible = expanded ? citations : citations.slice(0, 3);
  const remaining = citations.length - 3;

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
        <SourceCard
          key={`${citation.n}-${citation.chunkId ?? citation.chunkIndex}`}
          citation={citation}
          featured={citation.n === citations[0]?.n}
          index={index}
        />
      ))}
      {!expanded && remaining > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            color: "#F26419",
            fontSize: 13,
            fontWeight: 500,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.textDecoration = "underline";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.textDecoration = "none";
          }}
        >
          Show {remaining} more source{remaining === 1 ? "" : "s"}
        </button>
      ) : null}
    </div>
  );
}
