"use client";

import { IconChevronDown, IconChevronUp, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

export type HistoryItem = {
  id: string;
  question: string;
  active: boolean;
};

export function HistoryList({
  items,
  onSelect,
  onDelete,
}: {
  items: HistoryItem[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-1 text-[10px] font-medium tracking-[0.08em] text-[var(--sidebar-muted)] uppercase"
      >
        History
        {open ? <IconChevronUp size={12} stroke={1.8} /> : <IconChevronDown size={12} stroke={1.8} />}
      </button>
      {open ? (
        <div className="mt-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-1.5 text-[12px] text-[var(--sidebar-muted)]">No questions yet</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`group relative rounded-[8px] transition-colors duration-150 ease-in-out ${
                  item.active ? "bg-[var(--bg-sidebar-active)]" : "hover:bg-[var(--bg-sidebar-hover)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`block w-full truncate py-1.5 pr-8 pl-3 text-left text-[12px] ${
                    item.active ? "text-white" : "text-[#9CA3AF]"
                  }`}
                >
                  {item.question}
                </button>
                <button
                  type="button"
                  aria-label="Delete question"
                  onClick={() => onDelete(item.id)}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-[var(--sidebar-muted)] opacity-0 transition group-hover:opacity-100 hover:text-white"
                >
                  <IconTrash size={13} stroke={1.8} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
