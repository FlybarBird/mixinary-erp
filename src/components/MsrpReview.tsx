"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/pricing";

export function MsrpReview({
  jobId,
  results,
}: {
  jobId: string;
  results: Array<{
    id: string;
    product_name: string | null;
    sku: string | null;
    msrp: number | null;
    confidence: number | null;
    source_url: string | null;
    line_items: { description: string; msrp: number } | null;
  }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(results.filter((r) => r.msrp != null).map((r) => r.id)),
  );
  const [message, setMessage] = useState<string | null>(null);

  async function apply() {
    setMessage("Applying…");
    const res = await fetch("/api/msrp/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        acceptedResultIds: [...selected],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Apply failed");
      return;
    }
    router.push("/review");
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={apply}>
          Apply selected MSRP updates
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th></th>
              <th>Current item</th>
              <th>Current MSRP</th>
              <th>Proposed</th>
              <th>New MSRP</th>
              <th>Confidence</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={r.msrp == null}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      });
                    }}
                  />
                </td>
                <td>{r.line_items?.description}</td>
                <td>{formatMoney(r.line_items?.msrp)}</td>
                <td>
                  {r.product_name}
                  {r.sku ? ` (${r.sku})` : ""}
                </td>
                <td>{r.msrp == null ? "—" : formatMoney(r.msrp)}</td>
                <td>
                  {r.confidence == null
                    ? "—"
                    : `${(Number(r.confidence) * 100).toFixed(0)}%`}
                </td>
                <td>
                  {r.source_url ? (
                    <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: "#0176d3" }}>
                      Open
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
