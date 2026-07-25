"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectDashboard } from "@/lib/projects/dashboard";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/pricing";
import { ProjectHistoryPanel } from "@/components/ProjectHistoryPanel";

interface Props {
  dashboard: ProjectDashboard;
  canViewRates: boolean;
}

function severityStyle(severity: "info" | "watch" | "critical") {
  if (severity === "critical") return { color: "var(--danger)", label: "Critical" };
  if (severity === "watch") return { color: "var(--warn)", label: "Watch" };
  return { color: "var(--muted)", label: "Info" };
}

function KpiCard({
  label,
  value,
  href,
  hint,
  tone,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "#00c853"
      : tone === "bad"
        ? "#e53935"
        : undefined;
  const inner = (
    <div
      className="panel"
      style={{
        padding: "0.85rem 1rem",
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        cursor: href ? "pointer" : "default",
        borderColor: href ? "var(--line)" : undefined,
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color }}>{value}</div>
      {hint ? (
        <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{hint}</div>
      ) : null}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link>;
  return inner;
}

function OpsCard({
  label,
  value,
  href,
  warn,
}: {
  label: string;
  value: string | number;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div className="panel" style={{ padding: "0.75rem 0.9rem" }}>
        <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{label}</div>
        <div
          style={{
            fontSize: "1.15rem",
            fontWeight: 700,
            color: warn ? "var(--danger)" : undefined,
          }}
        >
          {value}
        </div>
      </div>
    </Link>
  );
}

export function ProjectDashboardView({ dashboard, canViewRates }: Props) {
  const [drill, setDrill] = useState<"ledger" | "profit" | null>(null);
  const d = dashboard;
  const base = `/projects/${d.projectId}`;

  const profitTone =
    d.forecastProfit == null
      ? "neutral"
      : d.forecastProfit > 0
        ? "good"
        : d.forecastProfit < 0
          ? "bad"
          : "neutral";

  const categoryRows = useMemo(() => d.categories, [d.categories]);

  function exportSummaryCsv() {
    const asOf = new Date().toISOString();
    const kpiRows: Array<[string, string | number]> = [
      ["As of", asOf],
      ["Project #", d.projectNumber],
      ["Project name", d.projectName],
      ["Client", d.clientName || ""],
      ["Status", d.status],
      ["Percent complete", d.percentComplete],
      ["Current revenue", d.currentRevenue ?? ""],
      ["Original cost budget", d.originalCostBudget ?? ""],
      ["Committed cost", d.committedCost],
      ["Actual cost", d.actualCost],
      ["Forecast final cost", d.forecastFinalCost],
      ["Forecast profit", d.forecastProfit ?? ""],
      ["Forecast margin %", d.forecastMargin == null ? "" : (d.forecastMargin * 100).toFixed(2)],
      ["Billed", d.billed],
      ["Collected", d.collected],
      ["AR outstanding", d.arOutstanding],
      ["Unbilled", d.unbilled ?? ""],
      ["AP unpaid", d.apUnpaid],
    ];
    const categoryHeader = [
      "Category",
      "Budget",
      "Committed",
      "Actual",
      "Forecast Final",
      "Variance",
    ];
    const categoryLines = categoryRows.map((row) =>
      [
        row.category,
        row.budget ?? "",
        row.committed,
        row.actual,
        row.forecastFinal,
        row.variance ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const kpiCsv = [
      "Metric,Value",
      ...kpiRows.map(
        ([k, v]) => `"${k.replace(/"/g, '""')}","${String(v).replace(/"/g, '""')}"`,
      ),
      "",
      categoryHeader.join(","),
      ...categoryLines,
    ].join("\n");
    const blob = new Blob([kpiCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${d.projectNumber || "project"}-financials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      {/* Header strip */}
      <div className="panel" style={{ padding: "1rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1.5rem",
            alignItems: "baseline",
          }}
        >
          <strong style={{ fontSize: "1.1rem" }}>
            {d.projectNumber} · {d.projectName}
          </strong>
          <span style={{ color: "var(--muted)" }}>
            {d.clientName || "No customer"}
          </span>
          <span style={{ color: "var(--muted)" }}>
            PM: {d.projectManagerName || "—"}
          </span>
          <span className="badge">{d.status.replace(/_/g, " ")}</span>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Start {d.startDate || "—"} · Target {d.targetCompletionDate || "—"}
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {d.percentComplete.toFixed(0)}% complete
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Financials{" "}
            {d.financialsUpdatedAt
              ? new Date(d.financialsUpdatedAt).toLocaleString()
              : "not built yet"}
          </span>
          <button type="button" className="btn" onClick={exportSummaryCsv}>
            Export CSV
          </button>
        </div>
        {d.dataNeedsAttention ? (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 0.75rem",
              background: "rgba(255, 193, 7, 0.12)",
              border: "1px solid var(--warn)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
            }}
          >
            <strong>Data needs attention:</strong>{" "}
            {d.dataNeedsAttentionReasons.join(" · ")}
          </div>
        ) : null}
      </div>

      {/* Primary KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "0.65rem",
        }}
      >
        <KpiCard
          label="Current Project Revenue"
          value={d.currentRevenue == null ? "—" : formatMoney(d.currentRevenue)}
          href={`${base}/change-orders`}
          hint={
            d.revenueBreakdown
              ? `Orig ${formatMoney(d.revenueBreakdown.original || 0)} · CO ${formatSignedMoney(d.revenueBreakdown.approvedChangeOrders)} · Manual ${formatSignedMoney(d.revenueBreakdown.manualAdjustments)}`
              : "Contract revenue"
          }
        />
        <KpiCard
          label="Original Cost Budget"
          value={
            d.originalCostBudget == null
              ? "—"
              : formatMoney(d.originalCostBudget)
          }
          href={`${base}?edit=1`}
        />
        <KpiCard
          label="Revised Cost Budget"
          value={
            d.revisedCostBudget == null
              ? "—"
              : formatMoney(d.revisedCostBudget)
          }
          href={`${base}/change-orders`}
          hint="Includes approved CO budget deltas"
        />
        <KpiCard
          label="Committed Cost"
          value={formatMoney(d.committedCost)}
          href={`${base}/procurement`}
          hint="Active PO obligations"
        />
        <KpiCard
          label="Actual Cost to Date"
          value={formatMoney(d.actualCost)}
          href="#ledger"
          hint="Click for ledger"
        />
        <div onClick={() => setDrill("profit")} role="button" tabIndex={0}>
          <KpiCard
            label="Forecast Final Cost"
            value={formatMoney(d.forecastFinalCost)}
            hint={`Incl. ${formatMoney(d.forecastUncommitted)} uncommitted`}
          />
        </div>
        <div onClick={() => setDrill("profit")} role="button" tabIndex={0}>
          <KpiCard
            label="Forecast Profit"
            value={
              d.forecastProfit == null
                ? "—"
                : formatSignedMoney(d.forecastProfit)
            }
            tone={profitTone}
          />
        </div>
        <KpiCard
          label="Forecast Margin"
          value={
            d.forecastMargin == null ? "—" : formatPct(d.forecastMargin)
          }
          hint={
            d.forecastMarkup == null
              ? undefined
              : `Markup ${formatPct(d.forecastMarkup)}`
          }
        />
        <KpiCard
          label="Cost Variance"
          value={
            d.costVariance == null ? "—" : formatSignedMoney(d.costVariance)
          }
          hint="Revised budget − forecast"
          tone={
            d.costVariance == null
              ? "neutral"
              : d.costVariance >= 0
                ? "good"
                : "bad"
          }
        />
      </div>

      {/* Cash / AR KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "0.65rem",
        }}
      >
        <KpiCard
          label="Billed to Date"
          value={formatMoney(d.billed)}
          href={`${base}/billing`}
        />
        <KpiCard
          label="Unbilled"
          value={d.unbilled == null ? "—" : formatMoney(d.unbilled)}
          href={`${base}/billing`}
          hint="Contract − billed"
        />
        <KpiCard
          label="Collected"
          value={formatMoney(d.collected)}
          href={`${base}/billing`}
        />
        <KpiCard
          label="AR Outstanding"
          value={formatMoney(d.arOutstanding)}
          href={`${base}/billing`}
          tone={d.arOutstanding > 0 ? "bad" : "neutral"}
        />
        <KpiCard
          label="Vendor AP Unpaid"
          value={formatMoney(d.apUnpaid)}
          href={`${base}/billing#ap`}
        />
        <KpiCard
          label="Labor Billable Value"
          value={formatMoney(d.laborBillableValue)}
          href={`${base}/labor`}
          hint="Approved hours × billing rate"
        />
      </div>

      {/* Material-only secondary */}
      <div className="panel" style={{ padding: "0.75rem 1rem" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
          Material-only (not full project profit)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", fontSize: "0.9rem" }}>
          <span>
            Material Sale <strong>{formatMoney(d.materialSale)}</strong>
          </span>
          <span>
            Material Forecast <strong>{formatMoney(d.materialForecast)}</strong>
          </span>
          <span>
            Material-Only Profit{" "}
            <strong>{formatSignedMoney(d.materialOnlyProfit)}</strong>
          </span>
          <span>
            Material-Only Margin{" "}
            <strong>
              {d.materialOnlyMargin == null
                ? "—"
                : formatPct(d.materialOnlyMargin)}
            </strong>
          </span>
        </div>
      </div>

      {/* Operational cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "0.65rem",
        }}
      >
        <OpsCard
          label="Open POs"
          value={`${d.openPoCount} · ${formatMoney(d.openPoValue)}`}
          href={`${base}/procurement`}
        />
        <OpsCard
          label="BOM not ordered"
          value={d.bomNotOrderedCount}
          href={`${base}/procurement`}
          warn={d.bomNotOrderedCount > 0}
        />
        <OpsCard
          label="Late items"
          value={d.delayedCount}
          href={`${base}/tracking`}
          warn={d.delayedCount > 0}
        />
        <OpsCard
          label="Due in 7 days"
          value={d.upcomingDeliveries}
          href={`${base}/tracking`}
        />
        <OpsCard
          label="Labor over budget"
          value={d.laborOverBudget ? "Yes" : "No"}
          href={`${base}/labor`}
          warn={d.laborOverBudget}
        />
        <OpsCard
          label="Unapproved expenses"
          value={d.unapprovedExpenseCount}
          href={`${base}/expenses`}
          warn={d.unapprovedExpenseCount > 0}
        />
        <OpsCard
          label="Pending change orders"
          value={d.pendingChangeOrderCount}
          href={`${base}/change-orders`}
          warn={d.pendingChangeOrderCount > 0}
        />
      </div>

      {/* Progress */}
      <div className="panel" style={{ padding: "1rem" }}>
        <strong style={{ fontSize: "0.9rem" }}>Project progress</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginTop: "0.65rem",
            fontSize: "0.85rem",
          }}
        >
          <div>Complete <strong>{d.progress.percentComplete.toFixed(0)}%</strong></div>
          <div>
            Budget spent{" "}
            <strong>
              {d.progress.percentBudgetSpent == null
                ? "—"
                : `${d.progress.percentBudgetSpent.toFixed(0)}%`}
            </strong>
          </div>
          <div>
            Labor hours{" "}
            <strong>
              {d.progress.percentLaborHoursUsed == null
                ? "—"
                : `${d.progress.percentLaborHoursUsed.toFixed(0)}%`}
            </strong>
          </div>
          <div>
            Materials ordered{" "}
            <strong>
              {d.progress.percentMaterialsOrdered == null
                ? "—"
                : `${d.progress.percentMaterialsOrdered.toFixed(0)}%`}
            </strong>
          </div>
          <div>
            Materials received{" "}
            <strong>
              {d.progress.percentMaterialsReceived == null
                ? "—"
                : `${d.progress.percentMaterialsReceived.toFixed(0)}%`}
            </strong>
          </div>
        </div>
        {d.progress.costAheadOfProgress ? (
          <div style={{ marginTop: "0.65rem", color: "var(--danger)", fontSize: "0.85rem" }}>
            Warning: cost % is significantly ahead of completion %.
          </div>
        ) : null}
      </div>

      {/* Cost by category */}
      <div className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
        <strong style={{ fontSize: "0.9rem" }}>Cost by category</strong>
        <table className="data-table" style={{ width: "100%", marginTop: "0.65rem", fontSize: "0.82rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Category</th>
              <th>Budget</th>
              <th>Committed</th>
              <th>Actual</th>
              <th>Forecast</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {categoryRows.map((row) => (
              <tr
                key={row.category}
                style={{ cursor: "pointer" }}
                onClick={() => setDrill("ledger")}
              >
                <td style={{ textAlign: "left", textTransform: "capitalize" }}>
                  {row.category}
                </td>
                <td style={{ textAlign: "right" }}>
                  {row.budget == null ? "—" : formatMoney(row.budget)}
                </td>
                <td style={{ textAlign: "right" }}>{formatMoney(row.committed)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(row.actual)}</td>
                <td style={{ textAlign: "right" }}>
                  {formatMoney(row.forecastFinal)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    color:
                      row.variance == null
                        ? undefined
                        : row.variance >= 0
                          ? "#00c853"
                          : "#e53935",
                  }}
                >
                  {row.variance == null ? "—" : formatSignedMoney(row.variance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Profit waterfall / history */}
      <div className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
        <strong style={{ fontSize: "0.9rem" }}>Profit waterfall history</strong>
        <p className="muted" style={{ fontSize: "0.8rem", margin: "0.35rem 0 0.65rem" }}>
          Snapshots captured on CO approve, invoice send, and payment.
        </p>
        {d.snapshots.length === 0 ? (
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            No snapshots yet — approve a change order or record a payment to start history.
          </div>
        ) : (
          <table className="data-table" style={{ width: "100%", fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>When</th>
                <th>Trigger</th>
                <th style={{ textAlign: "right" }}>Revenue</th>
                <th style={{ textAlign: "right" }}>Forecast cost</th>
                <th style={{ textAlign: "right" }}>Profit</th>
                <th style={{ textAlign: "right" }}>Billed</th>
                <th style={{ textAlign: "right" }}>AR</th>
                <th style={{ textAlign: "right" }}>Δ Profit</th>
              </tr>
            </thead>
            <tbody>
              {d.snapshots.map((s, idx) => {
                const newer = d.snapshots[idx - 1];
                const delta =
                  s.forecast_profit == null || newer?.forecast_profit == null
                    ? null
                    : newer.forecast_profit - s.forecast_profit;
                return (
                  <tr key={s.id}>
                    <td style={{ textAlign: "left" }}>
                      {new Date(s.captured_at).toLocaleString()}
                    </td>
                    <td>{s.trigger}</td>
                    <td style={{ textAlign: "right" }}>
                      {s.current_revenue == null
                        ? "—"
                        : formatMoney(s.current_revenue)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatMoney(s.forecast_final)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {s.forecast_profit == null
                        ? "—"
                        : formatSignedMoney(s.forecast_profit)}
                    </td>
                    <td style={{ textAlign: "right" }}>{formatMoney(s.billed)}</td>
                    <td style={{ textAlign: "right" }}>
                      {formatMoney(s.ar_outstanding)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {delta == null ? "—" : formatSignedMoney(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Action center */}
      <div className="panel" style={{ padding: "1rem" }}>
        <strong style={{ fontSize: "0.9rem" }}>Action & risk center</strong>
        <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1.1rem" }}>
          {d.alerts.length === 0 ? (
            <li style={{ color: "var(--muted)" }}>No open alerts</li>
          ) : (
            d.alerts.map((a) => {
              const sev = severityStyle(a.severity);
              return (
                <li key={a.key} style={{ marginBottom: "0.35rem" }}>
                  <span style={{ color: sev.color, fontWeight: 700 }}>
                    [{sev.label}]
                  </span>{" "}
                  <Link href={a.href}>
                    {a.label}
                    {a.count > 1 ? ` (${a.count})` : ""}
                  </Link>
                  {a.detail ? (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {" "}
                      — {a.detail}
                    </span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
        {d.duplicateAlerts?.length ? (
          <>
            <strong
              style={{
                fontSize: "0.85rem",
                display: "block",
                marginTop: "0.85rem",
              }}
            >
              Duplicate-cost suggestions
            </strong>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
              {d.duplicateAlerts.map((a) => {
                const sev = severityStyle(a.severity);
                return (
                  <li key={a.key} style={{ marginBottom: "0.35rem" }}>
                    <span style={{ color: sev.color, fontWeight: 700 }}>
                      [{sev.label}]
                    </span>{" "}
                    <Link href={a.href}>{a.label}</Link>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {a.detail}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>

      {/* Ledger drill */}
      <div id="ledger" className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: "0.9rem" }}>Cost ledger (sample)</strong>
          <button className="btn btn-ghost" type="button" onClick={() => setDrill(drill === "ledger" ? null : "ledger")}>
            {drill === "ledger" ? "Collapse" : "Expand"}
          </button>
        </div>
        {(drill === "ledger" || drill === "profit") && (
          <table className="data-table" style={{ width: "100%", marginTop: "0.65rem", fontSize: "0.78rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Category</th>
                <th style={{ textAlign: "left" }}>Source</th>
                <th style={{ textAlign: "left" }}>Description</th>
                <th>Committed</th>
                <th>Actual</th>
                <th>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {d.ledgerSample.map((row) => (
                <tr key={row.id}>
                  <td style={{ textAlign: "left" }}>{row.category}</td>
                  <td style={{ textAlign: "left" }}>{row.source_type}</td>
                  <td style={{ textAlign: "left" }}>{row.description || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(row.committed_amount)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(row.actual_amount)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(row.forecast_amount)}
                  </td>
                </tr>
              ))}
              {!d.ledgerSample.length ? (
                <tr>
                  <td colSpan={6} style={{ color: "var(--muted)" }}>
                    No ledger rows yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
        {drill === "profit" ? (
          <div style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
            <div>
              Forecast Profit = Current Revenue − Forecast Final Cost
            </div>
            <div>
              {d.currentRevenue == null ? "—" : formatMoney(d.currentRevenue)} −{" "}
              {formatMoney(d.forecastFinalCost)} ={" "}
              {d.forecastProfit == null
                ? "—"
                : formatSignedMoney(d.forecastProfit)}
            </div>
            <div style={{ color: "var(--muted)", marginTop: "0.35rem" }}>
              Forecast Final = Actual ({formatMoney(d.actualCost)}) + Remaining
              Committed ({formatMoney(d.committedCost)}) + Uncommitted Forecast
              ({formatMoney(d.forecastUncommitted)})
            </div>
          </div>
        ) : null}
        {!canViewRates ? (
          <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
            Internal labor rates are hidden for your role.
          </p>
        ) : null}
      </div>

      <ProjectHistoryPanel projectId={d.projectId} />
    </div>
  );
}
