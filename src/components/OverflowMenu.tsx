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
  // Fixed viewport coordinates so the panel escapes scrollable ancestors
  // (e.g. .table-wrap with overflow-x: auto, which would clip it).
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 2,
        right: document.documentElement.clientWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  }

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
    function onReposition() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  return (
    <div className="menu" data-open={open ? "true" : "false"} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={prominent ? "menu-trigger menu-trigger-prominent" : "menu-trigger"}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        ⋯
      </button>
      {open ? (
        <div
          className="menu-panel"
          role="menu"
          style={{
            ...(wide ? { minWidth: 200 } : null),
            ...(pos
              ? { position: "fixed" as const, top: pos.top, right: pos.right }
              : null),
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("[data-menu-submenu-trigger]")) return;
            if (target.closest("a.menu-item, button.menu-item")) {
              setOpen(false);
            }
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Nested flyout group for dense overflow menus. */
export function MenuSubmenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="menu-submenu"
      data-open={open ? "true" : "false"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="menu-item menu-submenu-trigger"
        data-menu-submenu-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span>{label}</span>
        <span className="menu-submenu-caret" aria-hidden>
          ›
        </span>
      </button>
      {open ? (
        <div className="menu-submenu-panel" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}
