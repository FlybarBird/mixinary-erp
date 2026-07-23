"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateLinePricing,
  formatMoney,
  sumPricing,
} from "@/lib/pricing";
import type { LineItem, OrderStatus, ProjectSection, Vendor } from "@/lib/types";
import { CurrencyInput } from "@/components/CurrencyInput";

type EditableLine = LineItem & { _key: string };

export function BomEditor({
  projectId,
  defaultOverridePct,
  initialSections,
  initialLines,
  vendors,
  canEditPricing,
}: {
  projectId: string;
  defaultOverridePct: number;
  initialSections: ProjectSection[];
  initialLines: LineItem[];
  vendors: Vendor[];
  canEditPricing: boolean;
}) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.map((l) => ({ ...l, _key: l.id })),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [productUrl, setProductUrl] = useState("");

  const priced = useMemo(
    () =>
      lines.map((line) =>
        calculateLinePricing({
          qty: line.qty,
          msrp: line.msrp,
          quote: line.quote,
          overridePct: line.override_pct,
          projectDefaultOverridePct: defaultOverridePct,
        }),
      ),
    [lines, defaultOverridePct],
  );
  const totals = useMemo(() => sumPricing(priced), [priced]);

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((prev) =>
      prev.map((line) => (line._key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine(sectionId: string | null) {
    const key = `new-${crypto.randomUUID()}`;
    setLines((prev) => [
      ...prev,
      {
        _key: key,
        id: key,
        project_id: projectId,
        section_id: sectionId,
        sort_order: prev.length,
        description: "New item",
        sku: null,
        qty: 1,
        msrp: 0,
        quote: null,
        override_pct: null,
        vendor_id: null,
        order_status: "none",
        tracking: null,
        carrier_id: null,
        notes: null,
        fetch_error: null,
        msrp_source_url: null,
        msrp_fetched_at: null,
      },
    ]);
  }

  function addSection() {
    const name = prompt("Section name");
    if (!name) return;
    const id = `new-section-${crypto.randomUUID()}`;
    setSections((prev) => [
      ...prev,
      {
        id,
        project_id: projectId,
        name,
        sort_order: prev.length,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/bom`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections, lines }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setMessage("Saved");
    router.refresh();
  }

  async function refreshMsrp() {
    const ids = [...selected];
    if (!ids.length) {
      setMessage("Select one or more lines first");
      return;
    }
    setMessage("Starting MSRP fetch…");
    const res = await fetch("/api/msrp/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        lineItemIds: ids,
        productUrl: productUrl || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "MSRP fetch failed");
      return;
    }
    router.push(`/review/${data.jobId}`);
  }

  async function uploadQuote(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);
    setMessage("Uploading quote…");
    const res = await fetch("/api/quotes/upload", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Quote upload failed");
      return;
    }
    router.push(`/review/${data.jobId}`);
  }

  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const unsorted = lines.filter((l) => !l.section_id || !sectionMap.has(l.section_id));
  const grouped = [
    ...sections
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => ({
        section,
        lines: lines
          .filter((l) => l.section_id === section.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      })),
    ...(unsorted.length
      ? [{ section: null as ProjectSection | null, lines: unsorted }]
      : []),
  ];

  return (
    <div className="stack">
      <div className="row">
        {canEditPricing ? (
          <>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save BOM"}
            </button>
            <button type="button" className="btn" onClick={addSection}>
              Add section
            </button>
            <button type="button" className="btn" onClick={() => addLine(sections[0]?.id ?? null)}>
              Add line
            </button>
            <button type="button" className="btn" onClick={refreshMsrp}>
              Refresh MSRP
            </button>
            <input
              className="field"
              style={{ maxWidth: 280 }}
              placeholder="Optional product URL (allowlisted)"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
            />
            <label className="btn">
              Upload PDF quote
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => uploadQuote(e.target.files?.[0] ?? null)}
              />
            </label>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save status / tracking"}
          </button>
        )}
        {message ? <span className="muted">{message}</span> : null}
      </div>

      <div className="row" style={{ gap: "1.25rem" }}>
        <span>MSRP {formatMoney(totals.totalMsrp)}</span>
        <span>Quote {formatMoney(totals.totalQuote)}</span>
        <span>Sale {formatMoney(totals.totalSale)}</span>
        <span>Savings {formatMoney(totals.clientSavings)}</span>
        <span style={{ fontWeight: 700 }}>
          Out of pocket {formatMoney(totals.outOfPocket)}
        </span>
      </div>

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <colgroup>
            <col className="col-check" />
            <col className="col-item" />
            <col className="col-sku" />
            <col className="col-qty" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-pct" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-vendor" />
            <col className="col-status" />
            <col className="col-track" />
            <col className="col-notes" />
            <col className="col-fetch" />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>Item</th>
              <th>SKU</th>
              <th>QTY</th>
              <th>MSRP</th>
              <th>Quote</th>
              <th>%</th>
              <th>Sale</th>
              <th>Total Sale</th>
              <th>OOP</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Tracking</th>
              <th>Notes</th>
              <th>Fetch</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ section, lines: groupLines }) => (
              <Fragment key={section?.id ?? "general"}>
                <tr className="section-row">
                  <td colSpan={15}>
                    <div className="section-bar">
                      <span>{section?.name ?? "General"}</span>
                      {canEditPricing ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => addLine(section?.id ?? null)}
                        >
                          Add line
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {groupLines.map((line) => {
                  const pricing = calculateLinePricing({
                    qty: line.qty,
                    msrp: line.msrp,
                    quote: line.quote,
                    overridePct: line.override_pct,
                    projectDefaultOverridePct: defaultOverridePct,
                  });
                  return (
                    <tr key={line._key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(line.id)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(line.id);
                              else next.delete(line.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={line.description}
                          disabled={!canEditPricing}
                          onChange={(e) =>
                            updateLine(line._key, { description: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line.sku ?? ""}
                          disabled={!canEditPricing}
                          onChange={(e) =>
                            updateLine(line._key, { sku: e.target.value || null })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.qty}
                          disabled={!canEditPricing}
                          onChange={(e) =>
                            updateLine(line._key, { qty: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <CurrencyInput
                          value={line.msrp}
                          disabled={!canEditPricing}
                          onChange={(msrp) =>
                            updateLine(line._key, { msrp: msrp ?? 0 })
                          }
                        />
                      </td>
                      <td>
                        <CurrencyInput
                          value={line.quote}
                          allowEmpty
                          disabled={!canEditPricing}
                          onChange={(quote) => updateLine(line._key, { quote })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={
                            line.override_pct == null
                              ? ""
                              : Number(line.override_pct) * 100
                          }
                          placeholder={(defaultOverridePct * 100).toFixed(2)}
                          disabled={!canEditPricing}
                          onChange={(e) =>
                            updateLine(line._key, {
                              override_pct:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value) / 100,
                            })
                          }
                        />
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(pricing.unitSale)}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(pricing.totalSale)}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(pricing.outOfPocket)}
                      </td>
                      <td>
                        <select
                          value={line.vendor_id ?? ""}
                          disabled={!canEditPricing}
                          onChange={(e) =>
                            updateLine(line._key, {
                              vendor_id: e.target.value || null,
                            })
                          }
                        >
                          <option value="">—</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.code}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={line.order_status}
                          onChange={(e) =>
                            updateLine(line._key, {
                              order_status: e.target.value as OrderStatus,
                            })
                          }
                        >
                          <option value="none">—</option>
                          <option value="ordered">Ordered</option>
                          <option value="shipped">Shipped</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={line.tracking ?? ""}
                          onChange={(e) =>
                            updateLine(line._key, {
                              tracking: e.target.value || null,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line.notes ?? ""}
                          onChange={(e) =>
                            updateLine(line._key, { notes: e.target.value || null })
                          }
                        />
                      </td>
                      <td
                        title={
                          line.fetch_error ??
                          (line.msrp_fetched_at ? "fetched" : "")
                        }
                        style={{
                          color: line.fetch_error ? "#b91c1c" : undefined,
                        }}
                      >
                        {line.fetch_error
                          ? "Error"
                          : line.msrp_fetched_at
                            ? "fetched"
                            : ""}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
