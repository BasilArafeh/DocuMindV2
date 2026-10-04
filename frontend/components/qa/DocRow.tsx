"use client";

import { IconFileText, IconTrash } from "@tabler/icons-react";

export function DocRow({
  name,
  passages,
  selected,
  onSelect,
  onDelete,
  deleting,
}: {
  name: string;
  passages: number;
  cites?: number;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div
      className="group relative"
      style={{
        background: selected ? "#252220" : undefined,
        borderLeft: selected ? "2px solid #F26419" : "2px solid transparent",
        transition: "background-color 150ms ease",
      }}
      onMouseEnter={(event) => {
        if (!selected) event.currentTarget.style.background = "#252220";
      }}
      onMouseLeave={(event) => {
        if (!selected) event.currentTarget.style.background = "transparent";
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left"
      >
        <IconFileText
          size={14}
          stroke={1.8}
          style={{
            marginTop: 3,
            flexShrink: 0,
            color: selected ? "#FFFFFF" : "#9CA3AF",
          }}
        />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate"
            style={{
              fontSize: 12,
              lineHeight: "20px",
              color: selected ? "#FFFFFF" : "#9CA3AF",
            }}
          >
            {name}
          </span>
          <span
            style={{
              marginTop: 2,
              display: "block",
              fontSize: 11,
              color: "#6B7280",
            }}
          >
            {passages} {passages === 1 ? "passage" : "passages"} indexed
          </span>
        </span>
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete ${name}`}
          disabled={deleting}
          onClick={onDelete}
          className="absolute top-1.5 right-1.5 rounded p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 disabled:opacity-40"
          style={{ color: "#6B7280" }}
        >
          <IconTrash size={13} stroke={1.8} />
        </button>
      ) : null}
    </div>
  );
}
