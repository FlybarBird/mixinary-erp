"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  projectId: string;
}

const CSV_EXPORTS = [
  { label: "BOM (CSV)", key: "bom" },
  { label: "Procurement / POs (CSV)", key: "procurement" },
  { label: "Shipment Tracking (CSV)", key: "tracking" },
  { label: "Labor Entries (CSV)", key: "labor" },
  { label: "Expenses (CSV)", key: "expenses" },
] as const;

const PDF_EXPORTS = [
  {
    label: "BOM PDF — with pricing",
    href: (id: string) => `/api/projects/${id}/export/bom-pdf?pricing=1`,
  },
  {
    label: "BOM PDF — without pricing",
    href: (id: string) => `/api/projects/${id}/export/bom-pdf?pricing=0`,
  },
] as const;

export function ProjectExportMenu({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const itemStyle: React.CSSProperties = {
    display: "block",
    padding: "0.5rem 1rem",
    fontSize: "0.82rem",
    color: "var(--fg, #111)",
    textDecoration: "none",
    cursor: "pointer",
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          padding: "0.35rem 0.75rem",
          fontSize: "0.82rem",
          background: "var(--surface, #f8f8f8)",
          border: "1px solid var(--line, #e5e7eb)",
          borderRadius: 6,
          cursor: "pointer",
          whiteSpace: "nowrap",
          color: "var(--fg, #111)",
        }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        ↓ Export
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 230,
            background: "var(--bg, #fff)",
            border: "1px solid var(--line, #e5e7eb)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            zIndex: 50,
            padding: "0.25rem 0",
          }}
        >
          <div
            style={{
              padding: "0.35rem 1rem 0.2rem",
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "var(--muted, #667)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            PDF
          </div>
          {PDF_EXPORTS.map(({ label, href }) => (
            <a
              key={label}
              href={href(projectId)}
              download
              role="menuitem"
              onClick={() => setOpen(false)}
              style={itemStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface, #f8f8f8)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {label}
            </a>
          ))}
          <div
            style={{
              height: 1,
              background: "var(--line, #e5e7eb)",
              margin: "0.35rem 0",
            }}
          />
          <div
            style={{
              padding: "0.35rem 1rem 0.2rem",
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "var(--muted, #667)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Spreadsheet
          </div>
          {CSV_EXPORTS.map(({ label, key }) => (
            <a
              key={key}
              href={`/api/projects/${projectId}/export/${key}`}
              download
              role="menuitem"
              onClick={() => setOpen(false)}
              style={itemStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface, #f8f8f8)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
