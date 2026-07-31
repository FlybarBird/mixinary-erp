"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SuiteApp } from "@/lib/suite/apps";

export function AppSelector({
  apps,
  currentId,
}: {
  apps: SuiteApp[];
  currentId?: SuiteApp["id"];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="suite-app-selector">
      <button
        type="button"
        className="suite-app-selector-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Apps
      </button>
      {open ? (
        <div role="menu" className="suite-app-selector-menu">
          {apps.map((app) => {
            const active = app.id === currentId;
            const className = `suite-app-selector-item${active ? " active" : ""}`;
            if (app.external) {
              return (
                <a
                  key={app.id}
                  href={app.href}
                  role="menuitem"
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  <span className="suite-app-selector-label">{app.label}</span>
                  <span className="suite-app-selector-desc">{app.description}</span>
                </a>
              );
            }
            return (
              <Link
                key={app.id}
                href={app.href}
                role="menuitem"
                className={className}
                onClick={() => setOpen(false)}
              >
                <span className="suite-app-selector-label">{app.label}</span>
                <span className="suite-app-selector-desc">{app.description}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
