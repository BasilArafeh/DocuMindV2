"use client";

import { IconGitCompare, IconList, IconZoomIn } from "@tabler/icons-react";
import type { ReactNode } from "react";

const FOLLOW_UPS: { prompt: string; icon: ReactNode }[] = [
  {
    prompt: "Summarize the key points",
    icon: <IconList size={14} stroke={1.8} />,
  },
  {
    prompt: "What should I pay attention to?",
    icon: <IconZoomIn size={14} stroke={1.8} />,
  },
  {
    prompt: "What isn’t covered?",
    icon: <IconGitCompare size={14} stroke={1.8} />,
  },
];

export function FollowUpChips({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap" }}>
      {FOLLOW_UPS.map((item, index) => (
        <button
          key={item.prompt}
          type="button"
          onClick={() => onAsk(item.prompt)}
          className="followup-enter"
          style={{
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
            animationDelay: `${index * 80}ms`,
            cursor: "pointer",
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
          {item.icon}
          {item.prompt}
        </button>
      ))}
    </div>
  );
}
