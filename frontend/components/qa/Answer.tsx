"use client";

import { Children, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { Citation as CitationRecord } from "@/lib/types";
import { GapCallout } from "./GapCallout";
import { Highlight } from "./Highlight";
import { SourceCards } from "./SourceCards";
import { Thinking } from "./Thinking";
import { useTether } from "./Tether";

function AnswerMark() {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        background: "#1C1A18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0,
      }}
      aria-hidden="true"
    >
      <span style={{ color: "#FFFFFF" }}>d</span>
      <span style={{ color: "#F26419" }}>.</span>
    </span>
  );
}

function AnswerCitation({ n }: { n: number }) {
  const tether = useTether();
  const active = tether?.displayN === n;

  return (
    <button
      type="button"
      aria-label={`Citation ${n}`}
      data-active={active ? "true" : undefined}
      onMouseEnter={() => tether?.setHoveredN(n)}
      onMouseLeave={() => tether?.setHoveredN(null)}
      onFocus={() => tether?.setHoveredN(n)}
      onBlur={() => tether?.setHoveredN(null)}
      onClick={() => tether?.selectN(n)}
      style={{
        display: "inline-flex",
        width: 18,
        height: 18,
        alignItems: "center",
        justifyContent: "center",
        background: active ? "#d95a16" : "#F26419",
        color: "#FFFFFF",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        verticalAlign: "middle",
        margin: "0 2px",
        border: "none",
        padding: 0,
        cursor: "pointer",
        lineHeight: 1,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      {n}
    </button>
  );
}

/** Protect [n] from ReactMarkdown link-reference parsing. */
function protectCitations(text: string) {
  return text.replace(/\[(\d+)\]/g, "⦃$1⦄");
}

function renderCitations(text: string) {
  const parts = text.split(/(⦃\d+⦄|\[\d+\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^(?:⦃(\d+)⦄|\[(\d+)\])$/);
    if (match) {
      const n = Number(match[1] ?? match[2]);
      return <AnswerCitation key={`${n}-${index}`} n={n} />;
    }
    return <span key={`t-${index}`}>{part}</span>;
  });
}

function formatInline(children: ReactNode) {
  return (
    <>
      {Children.map(children, (child) =>
        typeof child === "string" ? renderCitations(child) : child,
      )}
    </>
  );
}

const markdownComponents: Components = {
  p: ({ children }) => (
    <p style={{ marginBottom: 12 }}>{formatInline(children)}</p>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: "#1A1A1A" }}>{formatInline(children)}</strong>
  ),
  em: ({ children }) => <em style={{ fontStyle: "italic" }}>{formatInline(children)}</em>,
  ul: ({ children }) => (
    <ul
      style={{
        listStyle: "none",
        paddingLeft: 0,
        marginBottom: 12,
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        listStyle: "none",
        paddingLeft: 0,
        marginBottom: 12,
        counterReset: "answer-ol",
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      style={{
        position: "relative",
        listStyle: "none",
        marginBottom: 8,
        // Bullet (4px) + gap (10px): text column starts here on every wrapped line.
        paddingLeft: 14,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 10,
          width: 4,
          height: 4,
          borderRadius: 1,
          background: "#F26419",
        }}
      />
      <div
        style={{
          margin: 0,
          padding: 0,
          // Neutralize nested <p> margins from react-markdown loose lists
          // so the text block is a single flush column.
        }}
        className="answer-li-body"
      >
        {formatInline(children)}
      </div>
    </li>
  ),
  mark: ({ children }) => <Highlight>{children}</Highlight>,
};

export function Answer({
  content,
  citations = [],
  streaming,
  error,
  gap,
}: {
  content: string;
  citations?: CitationRecord[];
  streaming?: boolean;
  error?: string;
  gap?: string;
}) {
  const sourced = content ? protectCitations(content) : "";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <AnswerMark />
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#8A8A8A",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          }}
        >
          Answer
        </span>
      </div>

      {streaming ? (
        <div style={{ marginBottom: sourced ? 12 : 0 }}>
          <Thinking />
        </div>
      ) : null}

      {sourced ? (
        <div
          dir="auto"
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 15,
            lineHeight: 1.8,
            color: "#1A1A1A",
          }}
        >
          <ReactMarkdown components={markdownComponents}>{sourced}</ReactMarkdown>
        </div>
      ) : null}

      {error ? (
        <p
          style={{
            marginTop: 12,
            borderRadius: 11,
            border: "1px solid #E4E0D8",
            background: "#F4F2EE",
            padding: "8px 12px",
            fontSize: 13,
            color: "#4A4A4A",
          }}
        >
          {error}
        </p>
      ) : null}
      {gap ? <GapCallout>{gap}</GapCallout> : null}

      {!streaming && citations.length > 0 ? <SourceCards citations={citations} /> : null}
    </div>
  );
}
