"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";
import type { Citation } from "@/lib/types";
import { EvidencePanel } from "./EvidencePanel";

const PANEL_WIDTH = 336;
const EDGE_HIT = 24;
const COMMIT_RATIO = 0.4;
const FLICK_PX_PER_MS = 0.5;
const ARM_PX = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  origin: number;
  lastX: number;
  lastT: number;
  velocity: number;
  fromOpen: boolean;
  armed: boolean;
  captureTarget: HTMLElement;
};

export function EvidenceStage({
  citations,
  open,
  onOpen,
  onClose,
  animateIn = false,
}: {
  citations: Citation[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  animateIn?: boolean;
}) {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const offset = dragOffset ?? (open ? 0 : PANEL_WIDTH);
  const dragging = dragOffset !== null;

  const finish = useCallback(
    (nextOpen: boolean) => {
      setDragOffset(null);
      dragRef.current = null;
      if (nextOpen) onOpen();
      else onClose();
    },
    [onClose, onOpen],
  );

  const begin = (
    event: PointerEvent<HTMLElement>,
    fromOpen: boolean,
    armImmediately: boolean,
  ) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: fromOpen ? 0 : PANEL_WIDTH,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      fromOpen,
      armed: armImmediately,
      captureTarget: event.currentTarget,
    };
    if (armImmediately) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragOffset(fromOpen ? 0 : PANEL_WIDTH);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.armed) {
      if (Math.abs(dy) > ARM_PX && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      if (Math.abs(dx) > ARM_PX) {
        drag.armed = true;
        drag.captureTarget.setPointerCapture(event.pointerId);
      } else {
        return;
      }
    }

    const dt = event.timeStamp - drag.lastT || 1;
    drag.velocity = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    setDragOffset(clamp(drag.origin + dx, 0, PANEL_WIDTH));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.armed) {
      dragRef.current = null;
      return;
    }

    const traveled = Math.abs(offset - drag.origin);
    const flickedOpen = drag.velocity <= -FLICK_PX_PER_MS;
    const flickedClosed = drag.velocity >= FLICK_PX_PER_MS;
    const past = traveled >= PANEL_WIDTH * COMMIT_RATIO;

    if (drag.fromOpen) {
      finish(past || flickedClosed ? false : true);
    } else {
      finish(past || flickedOpen ? true : false);
    }
  };

  const visible = open || dragging || offset < PANEL_WIDTH - 1;
  const scrim = 1 - offset / PANEL_WIDTH;
  const transition = dragging ? "none" : "transform 200ms ease-out, opacity 200ms ease-out";

  return (
    <>
      <div
        className="hidden h-full overflow-hidden min-[1100px]:block"
        style={{
          width: open && citations.length > 0 ? PANEL_WIDTH : 0,
          transition: "width 200ms ease-out",
        }}
      >
        <EvidencePanel citations={citations} onClose={onClose} animateIn={animateIn} />
      </div>

      <div className="min-[1100px]:hidden">
        {visible ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-ink/40"
            style={{
              opacity: scrim,
              transition,
              pointerEvents: open || dragging ? "auto" : "none",
            }}
            aria-label="Hide evidence"
            onClick={onClose}
          />
        ) : null}

        {!open && citations.length > 0 ? (
          <div
            className="fixed inset-y-0 right-0 z-40 touch-none"
            style={{ width: EDGE_HIT }}
            onPointerDown={(event) => begin(event, false, true)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ) : null}

        <div
          className="fixed inset-y-3 right-3 z-50 w-[min(336px,calc(100vw-1.5rem))] overflow-hidden rounded-[16px] border border-border bg-page shadow-[0_12px_32px_rgba(26,26,26,0.16)]"
          style={{
            transform: `translateX(${offset}px)`,
            transition,
            pointerEvents: visible ? "auto" : "none",
          }}
        >
          <div
            className="absolute top-1/2 left-0 z-20 flex h-9 w-4 -translate-y-1/2 cursor-grab touch-none items-center"
            onPointerDown={(event) => begin(event, true, true)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="h-9 w-1 rounded-r-[2px] bg-line" aria-hidden="true" />
          </div>
          <div
            className="h-full"
            onPointerDown={(event) => begin(event, true, false)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <EvidencePanel
              citations={citations}
              variant="sheet"
              onClose={onClose}
              animateIn={animateIn}
            />
          </div>
        </div>
      </div>
    </>
  );
}
