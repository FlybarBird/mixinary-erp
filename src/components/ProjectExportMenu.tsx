"use client";

import { useState, useRef, useEffect } from "react";
import {
  PROJECT_CSV_EXPORTS,
  PROJECT_PDF_EXPORTS,
} from "@/lib/projects/export-menu";

interface Props {
  projectId: string;
}

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

  return (
    <div ref={ref} className="menu" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        ↓ Export
      </button>
      {open ? (
        <div
          className="menu-panel"
          role="menu"
          style={{ minWidth: 230 }}
          onClick={() => setOpen(false)}
        >
          <div className="menu-section">PDF</div>
          {PROJECT_PDF_EXPORTS.map(({ label, href }) => (
            <a
              key={label}
              href={href(projectId)}
              download
              role="menuitem"
              className="menu-item menu-item-link"
            >
              {label}
            </a>
          ))}
          <div className="menu-divider" />
          <div className="menu-section">Spreadsheet</div>
          {PROJECT_CSV_EXPORTS.map(({ label, key }) => (
            <a
              key={key}
              href={`/api/projects/${projectId}/export/${key}`}
              download
              role="menuitem"
              className="menu-item menu-item-link"
            >
              {label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
