"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type PanelPos = { top: number; left: number; minWidth: number };

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
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const minWidth = wide ? 200 : 152;
    const gap = 4;
    const estimatedHeight = panelRef.current?.offsetHeight ?? 280;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    const top = openUp
      ? Math.max(8, rect.top - estimatedHeight - gap)
      : rect.bottom + gap;
    const left = Math.min(
      Math.max(8, rect.right - minWidth),
      window.innerWidth - minWidth - 8,
    );
    setPos({ top, left, minWidth });
  }, [wide]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    // Re-measure after paint so panel height is accurate for flip.
    const id = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(id);
  }, [open, updatePosition, children]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      updatePosition();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    // Capture scroll from nested table-wrap / shell scrollers.
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  const panelStyle: CSSProperties | undefined = pos
    ? {
        position: "fixed",
        top: pos.top,
        left: pos.left,
        minWidth: pos.minWidth,
        right: "auto",
        zIndex: 200,
      }
    : undefined;

  const panel =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            className="menu-panel menu-panel-portal"
            role="menu"
            style={panelStyle}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("[data-menu-submenu-trigger]")) return;
              if (target.closest("a.menu-item, button.menu-item")) {
                setOpen(false);
              }
            }}
          >
            {children}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="menu" data-open={open ? "true" : "false"} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          prominent ? "menu-trigger menu-trigger-prominent" : "menu-trigger"
        }
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {panel}
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
