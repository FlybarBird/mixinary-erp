"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced autosave driven by a monotonically increasing revision.
 * Bump revision on user edits; do not bump after applying server responses.
 */
export function useDebouncedAutosave(options: {
  revision: number;
  enabled: boolean;
  delayMs?: number;
  save: () => Promise<void>;
}) {
  const { revision, enabled, delayMs = 900, save } = options;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const saveRef = useRef(save);
  const inFlight = useRef(false);
  const queued = useRef(false);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled || revision === 0) return;

    setStatus("pending");
    const timer = window.setTimeout(async () => {
      if (inFlight.current) {
        queued.current = true;
        return;
      }
      inFlight.current = true;
      setStatus("saving");
      try {
        do {
          queued.current = false;
          await saveRef.current();
        } while (queued.current);
        setStatus("saved");
      } catch {
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [revision, enabled, delayMs]);

  return status;
}

export function autosaveLabel(status: AutosaveStatus): string | null {
  if (status === "pending") return "Unsaved changes…";
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved";
  if (status === "error") return "Save failed";
  return null;
}
