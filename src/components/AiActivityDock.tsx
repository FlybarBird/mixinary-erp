"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ActivityJob = {
  id: string;
  type: string;
  status: string;
  title: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  href: string;
};

const DISMISS_KEY = "mixinary.ai.dock.dismissed";
const MINIMIZE_KEY = "mixinary.ai.dock.minimized";

function readDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

function statusLabel(status: string): string {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "needs_review") return "Ready for review";
  if (status === "failed") return "Failed";
  if (status === "applied") return "Finished";
  return status;
}

export function AiActivityDock() {
  const [jobs, setJobs] = useState<ActivityJob[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
    try {
      setMinimized(sessionStorage.getItem(MINIMIZE_KEY) === "1");
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/activity", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), 2500);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [poll]);

  const visible = jobs.filter((job) => {
    if (job.status === "queued" || job.status === "running") return true;
    return !dismissed.has(job.id);
  });

  const activeCount = visible.filter(
    (j) => j.status === "queued" || j.status === "running",
  ).length;

  function toggleMinimized() {
    setMinimized((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(MINIMIZE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  }

  function dismissAllDone() {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const job of visible) {
        if (job.status !== "queued" && job.status !== "running") {
          next.add(job.id);
        }
      }
      writeDismissed(next);
      return next;
    });
  }

  if (!ready || !visible.length) return null;

  return (
    <div className="ai-dock" role="status" aria-live="polite">
      <div className="ai-dock-header">
        <div className="ai-dock-title">
          {activeCount > 0 ? (
            <>
              <span className="ai-dock-spinner" aria-hidden />
              AI working ({activeCount})
            </>
          ) : (
            <>
              <span className="ai-dock-check" aria-hidden>
                ✓
              </span>
              AI updates
            </>
          )}
        </div>
        <div className="ai-dock-actions">
          {visible.some(
            (j) => j.status !== "queued" && j.status !== "running",
          ) ? (
            <button
              type="button"
              className="ai-dock-icon-btn"
              onClick={dismissAllDone}
              title="Clear finished"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            className="ai-dock-icon-btn"
            onClick={toggleMinimized}
            title={minimized ? "Expand" : "Minimize"}
            aria-expanded={!minimized}
          >
            {minimized ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {!minimized ? (
        <ul className="ai-dock-list">
          {visible.map((job) => {
            const running =
              job.status === "queued" || job.status === "running";
            return (
              <li key={job.id} className="ai-dock-item">
                <div className="ai-dock-item-main">
                  <div className="ai-dock-item-title">{job.title}</div>
                  <div
                    className={`ai-dock-item-status${
                      job.status === "failed" ? " is-failed" : ""
                    }${job.status === "needs_review" ? " is-ready" : ""}`}
                  >
                    {running ? (
                      <span className="ai-dock-spinner sm" aria-hidden />
                    ) : null}
                    {statusLabel(job.status)}
                    {job.status === "failed" && job.error
                      ? ` — ${job.error.slice(0, 80)}`
                      : ""}
                  </div>
                </div>
                <div className="ai-dock-item-side">
                  {job.status === "needs_review" || job.status === "failed" ? (
                    <Link href={job.href} className="ai-dock-link">
                      Open
                    </Link>
                  ) : null}
                  {!running ? (
                    <button
                      type="button"
                      className="ai-dock-icon-btn"
                      onClick={() => dismiss(job.id)}
                      title="Dismiss"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
