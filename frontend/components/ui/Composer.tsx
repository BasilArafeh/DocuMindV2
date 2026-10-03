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
    <form onSubmit={send} className="bg-transparent px-4 pt-1 pb-3 sm:px-5">
      <div className="flex items-end gap-2 rounded-[12px] border border-[var(--border)] bg-[#E8E4DC] px-3 py-2 transition-[border-color] duration-200 ease-in-out focus-within:border-[var(--orange)]">
        <span
          className="mb-[11px] h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--orange)]"
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
          className="max-h-36 min-h-[40px] flex-1 resize-none appearance-none bg-[#E8E4DC] py-2 text-[14px] leading-6 font-normal text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] disabled:cursor-not-allowed disabled:bg-[#E8E4DC] disabled:opacity-100"
        />
        <span className="mb-2 hidden shrink-0 text-[11px] text-[var(--ink-muted)] sm:block">⌘↵</span>
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
