"use client";

import { IconCircleCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { BrandMark } from "./BrandMark";

const MESSAGES = [
  "Uploading your document...",
  "Extracting text...",
  "Indexing passages...",
  "Almost ready...",
];

export function IndexingState({ phase }: { phase: "uploading" | "success" }) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phase !== "uploading") return;
    setMessageIndex(0);
    const id = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % MESSAGES.length);
    }, 1500);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "uploading") {
      setVisible(true);
      setProgress(0);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setProgress(90));
      });
      return () => window.cancelAnimationFrame(frame);
    }

    setProgress(100);
    const fade = window.setTimeout(() => setVisible(false), 500);
    return () => window.clearTimeout(fade);
  }, [phase]);

  return (
    <div
      className="flex h-full flex-col items-center justify-center px-6 text-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      <BrandMark size={48} />

      {phase === "success" ? (
        <IconCircleCheck
          size={28}
          stroke={1.8}
          style={{ marginTop: 20, color: "#F26419" }}
        />
      ) : (
        <p
          style={{
            marginTop: 20,
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontSize: 14,
            color: "#8A8A8A",
          }}
        >
          {MESSAGES[messageIndex]}
        </p>
      )}

      <div
        style={{
          marginTop: 16,
          width: 200,
          height: 3,
          background: "#E4E0D8",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "#F26419",
            borderRadius: 999,
            transition:
              phase === "success" ? "width 200ms ease" : "width 8s ease-in-out",
          }}
        />
      </div>
    </div>
  );
}
