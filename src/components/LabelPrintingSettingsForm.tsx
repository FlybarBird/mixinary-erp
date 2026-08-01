"use client";

import { FormEvent, useState } from "react";
import type { LabelPrinterBrand } from "@/lib/types";

export function LabelPrintingSettingsForm({
  initialPrinter,
}: {
  initialPrinter: LabelPrinterBrand;
}) {
  const [labelPrinter, setLabelPrinter] =
    useState<LabelPrinterBrand>(initialPrinter);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/label-printing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label_printer: labelPrinter }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setLabelPrinter(
      data.settings?.label_printer === "brother" ? "brother" : "dymo",
    );
    setMessage("Saved");
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="table-wrap panel-light" style={{ padding: "1rem" }}>
        <div className="label" style={{ marginBottom: "0.75rem" }}>
          Warehouse label printer
        </div>
        <p className="page-sub" style={{ marginTop: 0 }}>
          Choose which printer brand the receive / item QR label page uses.
          DYMO prints through DYMO Connect; Brother opens a QL 62mm PDF for
          browser / AirPrint.
        </p>

        <div
          className="segmented"
          role="radiogroup"
          aria-label="Label printer brand"
          style={{ marginBottom: "1rem" }}
        >
          <label
            className={`btn ${labelPrinter === "dymo" ? "btn-active" : ""}`}
            style={{ cursor: "pointer" }}
          >
            <input
              type="radio"
              name="label_printer"
              value="dymo"
              checked={labelPrinter === "dymo"}
              onChange={() => setLabelPrinter("dymo")}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            />
            DYMO LabelWriter
          </label>
          <label
            className={`btn ${labelPrinter === "brother" ? "btn-active" : ""}`}
            style={{ cursor: "pointer" }}
          >
            <input
              type="radio"
              name="label_printer"
              value="brother"
              checked={labelPrinter === "brother"}
              onChange={() => setLabelPrinter("brother")}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            />
            Brother QL
          </label>
        </div>

        {labelPrinter === "dymo" ? (
          <p className="page-sub" style={{ margin: 0, fontSize: "0.85rem" }}>
            Stock: DYMO 1-4/5″ × 3-1/10″ (1.8″ × 3.1″). Requires DYMO Connect
            Desktop.
          </p>
        ) : (
          <p className="page-sub" style={{ margin: 0, fontSize: "0.85rem" }}>
            Stock: Brother QL 62mm continuous (~46mm cut). Recommended:
            QL-820NWB / QL-1110NWB. Print via PDF → AirPrint or Brother
            utilities.
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {message ? (
          <span className="page-sub" style={{ margin: 0 }}>
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
