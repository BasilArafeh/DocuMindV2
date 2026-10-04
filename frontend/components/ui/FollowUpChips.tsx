"use client";

import { IconGitCompare, IconList, IconZoomIn } from "@tabler/icons-react";
import { useRef, type ReactNode } from "react";

const ICONS: ReactNode[] = [
  <IconList key="list" size={14} stroke={1.8} />,
  <IconZoomIn key="zoom" size={14} stroke={1.8} />,
  <IconGitCompare key="compare" size={14} stroke={1.8} />,
];

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#FFFFFF",
  border: "1px solid #E4E0D8",
  borderRadius: 20,
  padding: "6px 14px",
  fontSize: 13,
  color: "#4A4A4A",
  marginRight: 8,
  marginBottom: 8,
  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
  transition: "border-color 150ms ease, color 150ms ease",
  cursor: "pointer",
} as const;

export function FollowUpChips({
  onAsk,
  suggestions = [],
  loadingSuggestions = false,
}: {
  onAsk: (question: string) => void;
  suggestions?: string[];
  loadingSuggestions?: boolean;
}) {
  // Lock suggestions after upload so chips stay stable for the whole conversation.
  const lockedRef = useRef<string[]>([]);
  if (suggestions.length > 0) {
    lockedRef.current = suggestions;
  }
  const chips = lockedRef.current.length > 0 ? lockedRef.current : suggestions;

  if (loadingSuggestions && chips.length === 0) {
    return (
      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap" }}>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="animate-pulse"
            style={{
              display: "inline-block",
              background: "#E8E4DC",
              borderRadius: 20,
              padding: "6px 14px",
              marginRight: 8,
              marginBottom: 8,
              minWidth: 160,
              height: 32,
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  if (!chips.length) return null;

  return (
    <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap" }}>
      {chips.map((prompt, index) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onAsk(prompt)}
          className="followup-enter"
          style={{
            ...chipStyle,
            animationDelay: `${index * 80}ms`,
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.borderColor = "#F26419";
            event.currentTarget.style.color = "#F26419";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.borderColor = "#E4E0D8";
            event.currentTarget.style.color = "#4A4A4A";
          }}
        >
          {ICONS[index % ICONS.length]}
          {prompt}
        </button>
      ))}
    </div>
  );
}
