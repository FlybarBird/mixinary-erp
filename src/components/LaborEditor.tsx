"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/pricing";
import type { ApprovalStatus, LaborEntry } from "@/lib/types";
import { laborLinePricing, laborMsrp, laborQty } from "@/lib/projects/labor-export";
import { useDebouncedAutosave } from "@/lib/hooks/useDebouncedAutosave";
import { CurrencyInput } from "@/components/CurrencyInput";
import { useProjectLaborSummary } from "@/components/ProjectBomSummaryBar";

type EditableLine = LaborEntry & { _key: string };

const APPROVAL_BADGE: Record<ApprovalStatus, string> = {
  pending: "badge-neutral",
  approved: "badge-green",
  rejected: "badge-red",
};

function newLine(sortOrder: number): EditableLine {
  const id = `new-${crypto.randomUUID()}`;
  return {
    id,
    _key: id,
    project_id: "",
    worker_name: "",
    user_id: null,
    work_category: null,
    task_description: "General Labor",
    work_date: "",
    estimated_hours: 0,
    actual_hours: 0,
    regular_hours: 0,
    overtime_hours: 0,
    hourly_rate: 0,
    rate_type: "flat",
    qty: 1,
    msrp: 0,
    quote: null,
    override_pct: null,
    burden_pct: 0,
    billing_rate: 0,
    total_cost: 0,
    approval_status: "pending",
    notes: null,
    sort_order: sortOrder,
    created_by: null,
  };
}

export function LaborEditor({
  projectId,
  defaultOverridePct = 0,
  initialLines,
  canEdit,
  canApprove,
  canViewRates = false,
}: {
  projectId: string;
  defaultOverridePct?: number;
  initialLines: LaborEntry[];
  canEdit: boolean;
  canApprove: boolean;
  canViewRates?: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditableLine[]>(() =>
    (initialLines ?? [])
      .filter((e): e is LaborEntry => e != null)
      .map((l, i) => ({
        ...l,
        _key: l.id,
        qty: laborQty(l),
        msrp: laborMsrp(l),
        sort_order: l.sort_order ?? i,
      }))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    place: "before" | "after";
  } | null>(null);

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  const priced = useMemo(
    () => lines.map((l) => laborLinePricing(l, defaultOverridePct)),
    [lines, defaultOverridePct],
  );

  const summary = useMemo(() => {
    let totalMsrp = 0;
    let totalQuote = 0;
    let totalSale = 0;
    for (let i = 0; i < lines.length; i++) {
      const p = priced[i];
      totalMsrp += p.totalMsrp;
      totalQuote += p.totalQuote;
      totalSale += p.totalSale;
    }
    const profit = totalSale - totalQuote;
    const margin = totalSale > 0 ? profit / totalSale : null;
    return {
      totalMsrp,
      totalQuote,
      totalSale,
      profit,
      margin,
    };
  }, [priced]);

  const laborHeader = useProjectLaborSummary();
  const setLaborHeader = laborHeader?.setLabor;
  useEffect(() => {
    setLaborHeader?.({
      totalEst: summary.totalMsrp,
      totalQuote: summary.totalQuote,
      totalSale: summary.totalSale,
      profit: summary.profit,
      margin: summary.margin,
    });
  }, [
    setLaborHeader,
    summary.totalMsrp,
    summary.totalQuote,
    summary.totalSale,
    summary.profit,
    summary.margin,
  ]);

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, ...patch } : l)),
    );
    bump();
  }

  function addLine() {
    setLines((prev) => [...prev, newLine(prev.length)]);
    bump();
  }

  function removeSelected() {
    if (!selected.size) return;
    setLines((prev) => prev.filter((l) => !selected.has(l._key)));
    setSelected(new Set());
    bump();
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === lines.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(lines.map((l) => l._key)));
    }
  }

  function setApprovalForSelected(status: ApprovalStatus) {
    if (!canApprove || !selected.size) return;
    setLines((prev) =>
      prev.map((l) =>
        selected.has(l._key) ? { ...l, approval_status: status } : l,
      ),
    );
    bump();
  }

  function onDragStart(key: string) {
    setDragKey(key);
  }

  function onDragOver(e: DragEvent, key: string) {
    e.preventDefault();
    if (!dragKey || dragKey === key) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const place = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget({ key, place });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (!dragKey || !dropTarget) {
      setDragKey(null);
      setDropTarget(null);
      return;
    }
    setLines((prev) => {
      const from = prev.findIndex((l) => l._key === dragKey);
      if (from < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      let insertAt = next.findIndex((l) => l._key === dropTarget.key);
      if (insertAt < 0) return prev;
      if (dropTarget.place === "after") insertAt += 1;
      next.splice(insertAt, 0, moved);
      return next.map((l, i) => ({ ...l, sort_order: i }));
    });
    setDragKey(null);
    setDropTarget(null);
    bump();
  }

  const save = useCallback(async () => {
    if (!canEdit) return;
    setMessage(null);
    const payload = {
      lines: lines.map((l, index) => ({
        id: l.id,
        worker_name: l.worker_name || "",
        task_description: l.task_description || "Labor",
        work_date: l.work_date || "",
        qty: laborQty(l),
        msrp: Number(l.msrp || 0),
        quote: l.quote,
        override_pct: l.override_pct,
        approval_status: l.approval_status,
        notes: l.notes,
        sort_order: index,
      })),
    };
    const res = await fetch(`/api/projects/${projectId}/labor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "Failed to save labor");
      throw new Error(data.error || "Failed to save labor");
    }
    if (Array.isArray(data.entries)) {
      setLines(
        data.entries.map((e: LaborEntry, i: number) => ({
          ...e,
          _key: e.id,
          qty: laborQty(e),
          msrp: laborMsrp(e),
          sort_order: e.sort_order ?? i,
        })),
      );
      setSelected(new Set());
    }
    router.refresh();
  }, [canEdit, lines, projectId, router]);

  useDebouncedAutosave({
    revision,
    enabled: canEdit,
    delayMs: 900,
    save,
  });

  const allSelected = lines.length > 0 && selected.size === lines.length;
  const someSelected = selected.size > 0 && !allSelected;
  const colCount = canViewRates ? 14 : 7;

  return (
    <div className="stack" style={{ gap: "0.75rem" }}>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          {canEdit ? (
            <>
              <button type="button" className="btn" onClick={addLine}>
                + Add line
              </button>
              <button
                type="button"
                className="btn"
                disabled={!selected.size}
                onClick={removeSelected}
              >
                Delete selected
              </button>
            </>
          ) : null}
          {canApprove ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={!selected.size}
                onClick={() => setApprovalForSelected("approved")}
              >
                Approve selected
              </button>
              <button
                type="button"
                className="btn"
                disabled={!selected.size}
                onClick={() => setApprovalForSelected("pending")}
              >
                Unapprove selected
              </button>
            </>
          ) : null}
          {selected.size ? (
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {selected.size} selected
            </span>
          ) : null}
        </div>
        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
          <a
            className="btn btn-ghost"
            href={`/api/projects/${projectId}/export/labor`}
            style={{ fontSize: "0.8rem" }}
          >
            CSV
          </a>
          <a
            className="btn btn-ghost"
            href={`/api/projects/${projectId}/export/labor-xlsx`}
            style={{ fontSize: "0.8rem" }}
          >
            Excel
          </a>
          <a
            className="btn btn-ghost"
            href={`/api/projects/${projectId}/export/labor-pdf?pricing=${canViewRates ? 1 : 0}`}
            style={{ fontSize: "0.8rem" }}
          >
            PDF
          </a>
        </div>
      </div>

      {message ? (
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            color: message.includes("Fail")
              ? "var(--danger)"
              : "var(--muted)",
          }}
        >
          {message}
        </p>
      ) : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th aria-label="Reorder" />
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </th>
              <th>Item</th>
              <th>Notes</th>
              <th>Qty</th>
              {canViewRates ? <th title="Estimated unit cost">EST</th> : null}
              {canViewRates ? <th title="Total estimated">Total EST</th> : null}
              {canViewRates ? <th>Quote</th> : null}
              {canViewRates ? <th>Total Quote</th> : null}
              {canViewRates ? <th>%</th> : null}
              {canViewRates ? <th>Sale</th> : null}
              {canViewRates ? <th>Total Sale</th> : null}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr className="section-row">
                <td colSpan={colCount}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <strong>No labor lines</strong>
                    {canEdit ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: "0.78rem" }}
                        onClick={addLine}
                      >
                        + Add line
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : null}
            {lines.map((line, index) => {
              const pricing = priced[index];
              const dropHere =
                dropTarget?.key === line._key ? dropTarget.place : null;
              return (
                <Fragment key={line._key}>
                  <tr
                    draggable={canEdit}
                    onDragStart={() => onDragStart(line._key)}
                    onDragOver={(e) => onDragOver(e, line._key)}
                    onDrop={onDrop}
                    onDragEnd={() => {
                      setDragKey(null);
                      setDropTarget(null);
                    }}
                    style={{
                      outline:
                        dropHere === "before"
                          ? "2px solid var(--accent, #0a6)"
                          : dropHere === "after"
                            ? "2px solid var(--accent, #0a6)"
                            : undefined,
                      outlineOffset: -2,
                      opacity: dragKey === line._key ? 0.5 : 1,
                    }}
                  >
                    <td
                      className="col-drag"
                      style={{ cursor: canEdit ? "grab" : "default" }}
                    >
                      ⋮⋮
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(line._key)}
                        onChange={() => toggleSelect(line._key)}
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        disabled={!canEdit}
                        value={line.task_description ?? ""}
                        onChange={(e) =>
                          updateLine(line._key, {
                            task_description: e.target.value,
                          })
                        }
                        placeholder="Item"
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        disabled={!canEdit}
                        value={line.notes ?? ""}
                        onChange={(e) =>
                          updateLine(line._key, {
                            notes: e.target.value || null,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        type="number"
                        step="1"
                        min="0"
                        disabled={!canEdit}
                        value={line.qty ?? 1}
                        onChange={(e) =>
                          updateLine(line._key, {
                            qty: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    {canViewRates ? (
                      <td>
                        <CurrencyInput
                          value={line.msrp ?? 0}
                          disabled={!canEdit}
                          onChange={(v) =>
                            updateLine(line._key, { msrp: v ?? 0 })
                          }
                        />
                      </td>
                    ) : null}
                    {canViewRates ? (
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatMoney(pricing.totalMsrp)}
                      </td>
                    ) : null}
                    {canViewRates ? (
                      <td>
                        <CurrencyInput
                          value={line.quote ?? null}
                          disabled={!canEdit}
                          allowEmpty
                          isDefault={line.quote == null}
                          defaultDisplay={pricing.msrp}
                          onChange={(v) =>
                            updateLine(line._key, { quote: v })
                          }
                        />
                      </td>
                    ) : null}
                    {canViewRates ? (
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatMoney(pricing.totalQuote)}
                      </td>
                    ) : null}
                    {canViewRates ? (
                      <td>
                        <input
                          className="field"
                          type="number"
                          step="0.01"
                          disabled={!canEdit}
                          value={
                            line.override_pct == null
                              ? ""
                              : Number((line.override_pct * 100).toFixed(4))
                          }
                          placeholder={Number(
                            (defaultOverridePct * 100).toFixed(2),
                          ).toString()}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateLine(line._key, {
                              override_pct:
                                raw === ""
                                  ? null
                                  : (Number(raw) || 0) / 100,
                            });
                          }}
                        />
                      </td>
                    ) : null}
                    {canViewRates ? (
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatMoney(pricing.unitSale)}
                      </td>
                    ) : null}
                    {canViewRates ? (
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatMoney(pricing.totalSale)}
                      </td>
                    ) : null}
                    <td>
                      <span
                        className={`badge ${APPROVAL_BADGE[line.approval_status]}`}
                      >
                        {line.approval_status}
                      </span>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
