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

function toneToKpi(
  tone: "good" | "watch" | "bad" | "neutral",
): "good" | "bad" | "neutral" {
  if (tone === "good") return "good";
  if (tone === "bad") return "bad";
  return "neutral";
}

function WaterfallChart({
  steps,
}: {
  steps: ProjectDashboard["profitWaterfall"];
}) {
  const maxAbs = Math.max(
    1,
    ...steps.map((s) => Math.abs(s.key === "forecast" ? s.amount : s.running)),
  );
  return (
    <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.75rem" }}>
      {steps.map((step) => {
        const isEnd = step.key === "forecast" || step.key === "original";
        const value = isEnd ? step.amount : step.amount;
        const widthPct = Math.min(100, (Math.abs(value) / maxAbs) * 100);
        const positive = value >= 0;
        return (
          <div key={step.key}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.8rem",
                marginBottom: "0.2rem",
              }}
            >
              <span>{step.label}</span>
              <span style={{ fontWeight: 600 }}>
                {formatSignedMoney(value)}
                {!isEnd ? (
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {" "}
                    → {formatSignedMoney(step.running)}
                  </span>
                ) : null}
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: "rgba(128,128,128,0.15)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: "100%",
                  background: positive ? "#00c853" : "#e53935",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectDashboardView({ dashboard, canViewRates }: Props) {
  const [drill, setDrill] = useState<"ledger" | "profit" | null>(null);
  const [ledgerCategory, setLedgerCategory] = useState<string | null>(null);
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
  const filteredLedger = useMemo(() => {
    if (!ledgerCategory) return d.ledgerSample;
    return d.ledgerSample.filter((r) => r.category === ledgerCategory);
  }, [d.ledgerSample, ledgerCategory]);

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
          tone={toneToKpi(d.statusTone.margin)}
        />
        <KpiCard
          label="Cost Variance"
          value={
            d.costVariance == null ? "—" : formatSignedMoney(d.costVariance)
          }
          hint="Revised budget − forecast"
          tone={toneToKpi(d.statusTone.costVariance)}
        />
      </div>

      {/* Profit summary */}
      <div className="panel" style={{ padding: "0.85rem 1rem" }}>
        <strong style={{ fontSize: "0.9rem" }}>Profit summary</strong>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1.25rem",
            marginTop: "0.5rem",
            fontSize: "0.88rem",
          }}
        >
          <span>
            Original profit{" "}
            <strong>
              {d.originalProfit == null
                ? "—"
                : formatSignedMoney(d.originalProfit)}
            </strong>
            {d.originalMargin != null ? (
              <span className="muted"> ({formatPct(d.originalMargin)})</span>
            ) : null}
          </span>
          <span>
            Forecast profit{" "}
            <strong>
              {d.forecastProfit == null
                ? "—"
                : formatSignedMoney(d.forecastProfit)}
            </strong>
            {d.forecastMargin != null ? (
              <span className="muted"> ({formatPct(d.forecastMargin)})</span>
            ) : null}
          </span>
          <span>
            Δ profit{" "}
            <strong
              style={{
                color:
                  d.profitDelta == null
                    ? undefined
                    : d.profitDelta >= 0
                      ? "#00c853"
                      : "#e53935",
              }}
            >
              {d.profitDelta == null ? "—" : formatSignedMoney(d.profitDelta)}
            </strong>
          </span>
        </div>
      </div>

      {/* Cash / AR KPIs — billing ≠ revenue recognition */}
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
          hint="Not revenue recognition"
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
          label="Cash Paid Out"
          value={formatMoney(d.cashPaidOut)}
          href={`${base}/billing`}
          hint="AP paid + expenses + sub bills"
        />
        <KpiCard
          label="Cash Position"
          value={formatSignedMoney(d.cashPosition)}
          href={`${base}/billing`}
          hint="Collected − cash paid out"
          tone={d.cashPosition >= 0 ? "good" : "bad"}
        />
        <KpiCard
          label="AR Outstanding"
          value={formatMoney(d.arOutstanding)}
          href={`${base}/billing`}
          tone={toneToKpi(d.statusTone.ar)}
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
          hint={
            d.laborProfit == null
              ? "Approved hours × billing rate"
              : `Labor profit ${formatSignedMoney(d.laborProfit)}${
                  d.laborMargin == null ? "" : ` · ${formatPct(d.laborMargin)}`
                }`
          }
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
          <div>
            Invoiced{" "}
            <strong>
              {d.progress.percentInvoiced == null
                ? "—"
                : `${d.progress.percentInvoiced.toFixed(0)}%`}
            </strong>
          </div>
          <div>
            Collected{" "}
            <strong>
              {d.progress.percentCollected == null
                ? "—"
                : `${d.progress.percentCollected.toFixed(0)}%`}
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
                onClick={() => {
                  setLedgerCategory(row.category);
                  setDrill("ledger");
                }}
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

      {/* Profit waterfall */}
      <div className="panel" style={{ padding: "1rem", overflowX: "auto" }}>
        <strong style={{ fontSize: "0.9rem" }}>Profit waterfall</strong>
        <p className="muted" style={{ fontSize: "0.8rem", margin: "0.35rem 0 0" }}>
          Original contract profit → CO impact → cost variance → forecast profit.
        </p>
        <WaterfallChart steps={d.profitWaterfall} />

        <strong
          style={{
            fontSize: "0.85rem",
            display: "block",
            marginTop: "1.1rem",
          }}
        >
          Snapshot history
        </strong>
        <p className="muted" style={{ fontSize: "0.8rem", margin: "0.35rem 0 0.65rem" }}>
          Captured on CO approve, invoice send, and payment.
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <strong style={{ fontSize: "0.9rem" }}>Action & risk center</strong>
          <Link
            className="btn btn-ghost"
            href={`/api/projects/${d.projectId}/export/financials`}
            style={{ fontSize: "0.8rem" }}
          >
            Export financials CSV
          </Link>
        </div>
        <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1.1rem" }}>
          {d.alerts.length === 0 ? (
            <li style={{ color: "var(--muted)" }}>No open alerts</li>
          ) : (
            d.alerts.map((a) => {
              const sev = severityStyle(a.severity);
              return (
                <li key={a.key} style={{ marginBottom: "0.45rem" }}>
                  <span style={{ color: sev.color, fontWeight: 700 }}>
                    [{sev.label}]
                  </span>{" "}
                  <Link href={a.href}>
                    {a.label}
                    {a.count > 1 ? ` (${a.count})` : ""}
                  </Link>
                  {a.dollarImpact != null ? (
                    <span style={{ fontWeight: 600 }}>
                      {" "}
                      · {formatSignedMoney(a.dollarImpact)}
                    </span>
                  ) : null}
                  {a.responsiblePerson ? (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {" "}
                      · Owner {a.responsiblePerson}
                    </span>
                  ) : null}
                  {a.dueDate ? (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {" "}
                      · Due {a.dueDate}
                    </span>
                  ) : null}
                  {a.detail ? (
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {a.detail}
                    </div>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.9rem" }}>
            Cost ledger
            {ledgerCategory ? ` · ${ledgerCategory}` : " (sample)"}
          </strong>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {ledgerCategory ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setLedgerCategory(null)}
              >
                Clear filter
              </button>
            ) : null}
            <button className="btn btn-ghost" type="button" onClick={() => setDrill(drill === "ledger" ? null : "ledger")}>
              {drill === "ledger" ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
        {(drill === "ledger" || drill === "profit") && (
          <table className="data-table" style={{ width: "100%", marginTop: "0.65rem", fontSize: "0.78rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Category</th>
                <th style={{ textAlign: "left" }}>Source</th>
                <th style={{ textAlign: "left" }}>Description</th>
                <th style={{ textAlign: "left" }}>CO</th>
                <th>Committed</th>
                <th>Actual</th>
                <th>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((row) => (
                <tr key={row.id}>
                  <td style={{ textAlign: "left" }}>{row.category}</td>
                  <td style={{ textAlign: "left" }}>{row.source_type}</td>
                  <td style={{ textAlign: "left" }}>{row.description || "—"}</td>
                  <td style={{ textAlign: "left", fontSize: "0.72rem" }}>
                    {row.change_order_id
                      ? row.change_order_id.slice(0, 8)
                      : "—"}
                  </td>
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
              {!filteredLedger.length ? (
                <tr>
                  <td colSpan={7} style={{ color: "var(--muted)" }}>
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
