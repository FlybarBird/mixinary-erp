"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function OverflowMenu({
  children,
  label = "More actions",
  wide = false,
  prominent = false,
}: {
  children: ReactNode;
  label?: string;
  /** Wider panel for longer labels (e.g. export links). */
  wide?: boolean;
  /** Stronger bordered trigger for primary page actions. */
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" data-open={open ? "true" : "false"} ref={rootRef}>
      <button
        type="button"
        className={prominent ? "menu-trigger menu-trigger-prominent" : "menu-trigger"}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div
          className="menu-panel"
          role="menu"
          onClick={() => setOpen(false)}
          style={wide ? { minWidth: 230 } : undefined}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
