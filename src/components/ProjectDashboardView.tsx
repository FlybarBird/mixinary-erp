"use client";

import Link from "next/link";
import type { ProjectDashboard } from "@/lib/projects/dashboard";
import { formatMoney } from "@/lib/pricing";
import { ProjectHistoryPanel } from "@/components/ProjectHistoryPanel";

interface Props {
  dashboard: ProjectDashboard;
}

function BudgetBar({
  label,
  budget,
  committed,
  actual,
}: {
  label: string;
  budget: number | null;
  committed: number;
  actual: number;
}) {
  const pctCommitted = budget && budget > 0 ? Math.min((committed / budget) * 100, 100) : null;
  const pctActual = budget && budget > 0 ? Math.min((actual / budget) * 100, 100) : null;
  const overBudget = budget != null && committed > budget;

  return (
    <div className="panel" style={{ padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{label}</span>
        {budget != null && (
          <span style={{ fontSize: "0.75rem", color: overBudget ? "var(--red, #c00)" : "var(--muted)" }}>
            Budget: {formatMoney(budget)}
          </span>
        )}
      </div>
      {budget != null && (
        <div style={{ height: 8, background: "var(--line)", borderRadius: 4, marginBottom: "0.5rem", overflow: "hidden", position: "relative" }}>
          {pctCommitted != null && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${pctCommitted}%`,
                background: overBudget ? "var(--red, #c00)" : "var(--blue, #3b82f6)",
                borderRadius: 4,
                opacity: 0.4,
              }}
            />
          )}
          {pctActual != null && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${pctActual}%`,
                background: overBudget ? "var(--red, #c00)" : "var(--blue, #3b82f6)",
                borderRadius: 4,
              }}
            />
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.8rem" }}>
        <span>
          <span style={{ color: "var(--muted)" }}>Committed: </span>
          <strong>{formatMoney(committed)}</strong>
        </span>
        <span>
          <span style={{ color: "var(--muted)" }}>Actual: </span>
          <strong>{formatMoney(actual)}</strong>
        </span>
        {budget != null && (
          <span>
            <span style={{ color: overBudget ? "var(--red, #c00)" : "var(--muted)" }}>
              {overBudget ? "Over by: " : "Remaining: "}
            </span>
            <strong style={{ color: overBudget ? "var(--red, #c00)" : undefined }}>
              {formatMoney(Math.abs(budget - committed))}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}

export function ProjectDashboardView({ dashboard }: Props) {
  const {
    materialBudget,
    materialCommitted,
    materialActual,
    laborBudget,
    laborActual,
    laborPending,
    otherExpenses,
    openPoCount,
    openPoValue,
    bomNotOrderedCount,
    awaitingShipmentCount,
    delayedCount,
    upcomingDeliveries,
    alerts,
    projectId,
  } = dashboard;

  const totalProjected = materialCommitted + laborActual + otherExpenses;

  const base = `/projects/${projectId}`;

  return (
    <div className="stack">
      <div className="workspace-summary">
        <div className="workspace-stat">
          <div className="label">Material Committed</div>
          <div className="value">{formatMoney(materialCommitted)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Labor Actual</div>
          <div className="value">{formatMoney(laborActual)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Other Expenses</div>
          <div className="value">{formatMoney(otherExpenses)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Total Projected Cost</div>
          <div className="value">{formatMoney(totalProjected)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Open POs</div>
          <div className="value">{openPoCount}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Open PO Value</div>
          <div className="value">{formatMoney(openPoValue)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <BudgetBar
          label="Materials"
          budget={materialBudget}
          committed={materialCommitted}
          actual={materialActual}
        />
        <BudgetBar
          label="Labor"
          budget={laborBudget}
          committed={laborActual + laborPending}
          actual={laborActual}
        />
      </div>

      {alerts.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Alerts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {alerts.map((alert) => (
              <Link
                key={alert.key}
                href={alert.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.6rem 0.85rem",
                  background: "#fff",
                  border: "1px solid var(--line)",
                  borderLeft: "3px solid var(--red, #c00)",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                  color: "inherit",
                  fontSize: "0.85rem",
                }}
              >
                <span>{alert.label}</span>
                <span
                  style={{
                    background: "var(--red, #c00)",
                    color: "#fff",
                    borderRadius: "999px",
                    padding: "0.1rem 0.5rem",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  {alert.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        <div className="panel" style={{ padding: "1rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>Procurement</div>
          <dl style={{ margin: 0, fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>BOM Not Ordered</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                <Link href={`${base}/procurement`} style={{ textDecoration: "none" }}>
                  {bomNotOrderedCount}
                </Link>
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Open POs</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                <Link href={`${base}/procurement`} style={{ textDecoration: "none" }}>
                  {openPoCount}
                </Link>
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Open PO Value</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{formatMoney(openPoValue)}</dd>
            </div>
          </dl>
        </div>

        <div className="panel" style={{ padding: "1rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>Shipping</div>
          <dl style={{ margin: 0, fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Awaiting Shipment</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                <Link href={`${base}/tracking`} style={{ textDecoration: "none" }}>
                  {awaitingShipmentCount}
                </Link>
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: delayedCount > 0 ? "var(--red, #c00)" : "var(--muted)" }}>Delayed / Backordered</dt>
              <dd style={{ margin: 0, fontWeight: 600, color: delayedCount > 0 ? "var(--red, #c00)" : undefined }}>
                <Link href={`${base}/tracking?filter=delayed`} style={{ textDecoration: "none", color: "inherit" }}>
                  {delayedCount}
                </Link>
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Due This Week</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                <Link href={`${base}/tracking`} style={{ textDecoration: "none" }}>
                  {upcomingDeliveries}
                </Link>
              </dd>
            </div>
          </dl>
        </div>

        <div className="panel" style={{ padding: "1rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>Labor</div>
          <dl style={{ margin: 0, fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Actual Cost</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{formatMoney(laborActual)}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Pending Approval</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                <Link href={`${base}/labor`} style={{ textDecoration: "none" }}>
                  {formatMoney(laborPending)}
                </Link>
              </dd>
            </div>
            {laborBudget != null && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: laborActual > laborBudget ? "var(--red, #c00)" : "var(--muted)" }}>
                  {laborActual > laborBudget ? "Over Budget" : "Budget Remaining"}
                </dt>
                <dd style={{ margin: 0, fontWeight: 600, color: laborActual > laborBudget ? "var(--red, #c00)" : undefined }}>
                  {formatMoney(Math.abs(laborBudget - laborActual))}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="panel" style={{ padding: "1rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>Expenses</div>
          <dl style={{ margin: 0, fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Other Expenses</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                <Link href={`${base}/expenses`} style={{ textDecoration: "none" }}>
                  {formatMoney(otherExpenses)}
                </Link>
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--muted)" }}>Total Projected</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{formatMoney(totalProjected)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="panel" style={{ padding: "1rem" }}>
        <ProjectHistoryPanel projectId={projectId} />
      </div>
    </div>
  );
}
