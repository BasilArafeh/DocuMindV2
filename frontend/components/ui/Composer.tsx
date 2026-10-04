"use client";

import { IconArrowUp } from "@tabler/icons-react";
import { type FormEvent, type KeyboardEvent, type RefObject } from "react";

export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const send = (event?: FormEvent) => {
    event?.preventDefault();
    onSubmit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={send}
      style={{
        display: "flex",
        justifyContent: "center",
        background: "transparent",
        padding: "4px 24px 0",
        marginBottom: 24,
      }}
    >
      <div
        className="flex items-end gap-2 transition-[border-color] duration-200 ease-in-out focus-within:border-[var(--orange)]"
        style={{
          width: "100%",
          maxWidth: 780,
          background: "#EDEAE2",
          border: "1px solid #DDD8CE",
          borderRadius: 16,
          padding: "6px 10px 6px 14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--orange)]"
            style={{
              flexShrink: 0,
              alignSelf: "center",
              marginBottom: 0,
            }}
            aria-hidden="true"
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            className="max-h-36 flex-1 resize-none appearance-none text-[14px] leading-6 font-normal text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] disabled:cursor-not-allowed disabled:opacity-100"
            style={{
              background: "#EDEAE2",
              minHeight: 32,
              paddingTop: 4,
              paddingBottom: 4,
            }}
          />
        </div>
        <span className="mb-1.5 hidden shrink-0 text-[11px] text-[var(--ink-muted)] sm:block">⌘↵</span>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send question"
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#16181d] text-white transition-colors hover:bg-[#0E1014] disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--ink-muted)]"
        >
          <IconArrowUp size={16} stroke={2.2} />
        </button>
      </div>
    </form>
  );
}
