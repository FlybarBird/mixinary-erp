"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/format";

export function CurrencyInput({
  value,
  disabled,
  allowEmpty = false,
  isDefault = false,
  defaultDisplay,
  onChange,
}: {
  value: number | null;
  disabled?: boolean;
  allowEmpty?: boolean;
  /** When true, treat empty/null as still using the default quote (MSRP). */
  isDefault?: boolean;
  /** Value to show while still on the default (e.g. MSRP). */
  defaultDisplay?: number | null;
  onChange: (value: number | null) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!focused) {
      setDraft(value == null ? "" : String(value));
    }
  }, [value, focused]);

  const shownDefault =
    defaultDisplay == null || Number.isNaN(Number(defaultDisplay))
      ? 0
      : Number(defaultDisplay);

  if (disabled) {
    return (
      <span
        className={cn(
          "currency-display",
          isDefault ? "is-default-quote" : "",
        )}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value == null
          ? isDefault
            ? formatMoney(shownDefault)
            : "—"
          : formatMoney(value)}
      </span>
    );
  }

  if (!focused) {
    return (
      <button
        type="button"
        className={cn(
          "currency-display",
          isDefault ? "is-default-quote" : "",
        )}
        title={
          isDefault
            ? "Default quote (uses MSRP). Click to set a custom quote."
            : undefined
        }
        onClick={() => setFocused(true)}
      >
        {value == null && allowEmpty
          ? isDefault
            ? formatMoney(shownDefault)
            : "—"
          : formatMoney(value ?? 0)}
      </button>
    );
  }

  return (
    <input
      className={cn("currency-edit", isDefault ? "is-default-quote" : "")}
      type="number"
      step="0.01"
      autoFocus
      value={draft}
      placeholder={isDefault ? String(shownDefault) : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (draft.trim() === "" && allowEmpty) {
          onChange(null);
          return;
        }
        const next = Number(draft);
        onChange(Number.isFinite(next) ? next : allowEmpty ? null : 0);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
