"use client";

import { useTether } from "./Tether";

export function Citation({ n }: { n: number }) {
  const tether = useTether();
  const active = tether?.displayN === n;

  return (
    <button
      type="button"
      className="citation-chip"
      data-active={active ? "true" : undefined}
      aria-label={`Citation ${n}`}
      onMouseEnter={() => tether?.setHoveredN(n)}
      onMouseLeave={() => tether?.setHoveredN(null)}
      onFocus={() => tether?.setHoveredN(n)}
      onBlur={() => tether?.setHoveredN(null)}
      onClick={() => tether?.selectN(n)}
    >
      {n}
    </button>
  );
}
