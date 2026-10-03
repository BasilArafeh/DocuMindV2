import type { ReactNode } from "react";

export function GapCallout({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex gap-3 rounded-[12px] border border-border bg-page px-3.5 py-3">
      <span
        className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-sage text-[12px] font-semibold text-sage"
        aria-hidden="true"
      >
        !
      </span>
      <div className="text-[13px] leading-5 text-ink-soft">{children}</div>
    </div>
  );
}
