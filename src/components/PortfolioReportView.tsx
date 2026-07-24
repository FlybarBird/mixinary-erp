"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PortfolioRow } from "@/lib/projects/portfolio";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/pricing";

export function PortfolioReportView({ rows }: { rows: PortfolioRow[] }) {
  const [status, setStatus] = useState("all");
  const [pm, setPm] = useState("all");
  const [client, setClient] = useState("all");
  const [q, setQ] = useState("");

  const pms = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.projectManagerName).filter(Boolean)),
      ) as string[],
    [rows],
  );
  const clients = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.clientName).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (pm !== "all" && r.projectManagerName !== pm) return false;
      if (client !== "all" && r.clientName !== client) return false;
      if (q) {
        const hay = `${r.projectNumber} ${r.projectName} ${r.clientName || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, status, pm, client, q]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        revenue: acc.revenue + (r.currentRevenue || 0),
        profit: acc.profit + (r.forecastProfit || 0),
        ar: acc.ar + r.arOutstanding,
        attention: acc.attention + (r.dataNeedsAttention ? 1 : 0),
      }),
      { revenue: 0, profit: 0, ar: 0, attention: 0 },
    );
  }, [filtered]);

  function exportCsv() {
    const header = [
      "Project #",
      "Name",
      "Client",
      "PM",
      "Status",
      "% Complete",
      "Revenue",
      "Forecast Cost",
      "Forecast Profit",
      "Margin",
      "Billed",
      "AR",
      "Unbilled",
      "Needs Attention",
    ];
    const lines = filtered.map((r) =>
      [
        r.projectNumber,
        r.projectName,
        r.clientName || "",
        r.projectManagerName || "",
        r.status,
        r.percentComplete,
        r.currentRevenue ?? "",
        r.forecastFinalCost,
        r.forecastProfit ?? "",
        r.forecastMargin == null ? "" : (r.forecastMargin * 100).toFixed(2),
        r.billed,
        r.arOutstanding,
        r.unbilled ?? "",
        r.dataNeedsAttention ? "yes" : "no",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio-financials.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Portfolio financials
          </h1>
          <p className="page-sub">
            Cross-project revenue, forecast profit, and AR.
          </p>
        </div>
        <button type="button" className="btn" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div className="workspace-stat">
          <div className="label">Revenue (filtered)</div>
          <div className="value">{formatMoney(totals.revenue)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Forecast profit</div>
          <div className="value">{formatSignedMoney(totals.profit)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">AR outstanding</div>
          <div className="value">{formatMoney(totals.ar)}</div>
        </div>
        <div className="workspace-stat">
          <div className="label">Needs attention</div>
          <div className="value">{totals.attention}</div>
        </div>
      </div>

      <div
        className="panel"
        style={{
          padding: "0.75rem",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "0.5rem",
        }}
      >
        <input
          className="field"
          placeholder="Search projects"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="on_hold">On hold</option>
          <option value="complete">Complete</option>
        </select>
        <select className="field" value={pm} onChange={(e) => setPm(e.target.value)}>
          <option value="all">All PMs</option>
          {pms.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={client}
          onChange={(e) => setClient(e.target.value)}
        >
          <option value="all">All clients</option>
          {clients.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="panel" style={{ padding: "0.75rem", overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client / PM</th>
              <th style={{ textAlign: "right" }}>Revenue</th>
              <th style={{ textAlign: "right" }}>Forecast cost</th>
              <th style={{ textAlign: "right" }}>Profit</th>
              <th style={{ textAlign: "right" }}>Margin</th>
              <th style={{ textAlign: "right" }}>Billed</th>
              <th style={{ textAlign: "right" }}>AR</th>
              <th style={{ textAlign: "right" }}>Unbilled</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.projectId}>
                <td>
                  <Link href={`/projects/${r.projectId}/dashboard`}>
                    {r.projectNumber}
                  </Link>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {r.projectName} · {r.percentComplete}% · {r.status}
                    {r.dataNeedsAttention ? " · needs attention" : ""}
                  </div>
                </td>
                <td>
                  {r.clientName || "—"}
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {r.projectManagerName || "No PM"}
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.currentRevenue == null ? "—" : formatMoney(r.currentRevenue)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {formatMoney(r.forecastFinalCost)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.forecastProfit == null
                    ? "—"
                    : formatSignedMoney(r.forecastProfit)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.forecastMargin == null ? "—" : formatPct(r.forecastMargin)}
                </td>
                <td style={{ textAlign: "right" }}>{formatMoney(r.billed)}</td>
                <td style={{ textAlign: "right" }}>
                  {formatMoney(r.arOutstanding)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.unbilled == null ? "—" : formatMoney(r.unbilled)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
