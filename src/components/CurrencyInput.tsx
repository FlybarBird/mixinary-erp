"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";

export function CurrencyInput({
  value,
  disabled,
  allowEmpty = false,
  onChange,
}: {
  value: number | null;
  disabled?: boolean;
  allowEmpty?: boolean;
  onChange: (value: number | null) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!focused) {
      setDraft(value == null ? "" : String(value));
    }
  }, [value, focused]);

  if (disabled) {
    return (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "—" : formatMoney(value)}
      </span>
    );
  }

  if (!focused) {
    return (
      <button
        type="button"
        className="currency-display"
        onClick={() => setFocused(true)}
      >
        {value == null && allowEmpty ? "—" : formatMoney(value ?? 0)}
      </button>
    );
  }

  return (
    <input
      className="currency-edit"
      type="number"
      step="0.01"
      autoFocus
      value={draft}
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
