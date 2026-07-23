"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/pricing";

export function QuoteReview({
  jobId,
  lines,
  sections,
  projectId,
}: {
  jobId: string;
  projectId: string;
  sections: { id: string; name: string }[];
  lines: Array<{
    id: string;
    sku: string | null;
    description: string | null;
    qty: number | null;
    unit_price: number | null;
    action: string | null;
    match_score: number | null;
    selected: boolean;
    matched: { description: string; quote: number | null } | null;
  }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(lines.filter((l) => l.selected).map((l) => l.id)),
  );
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);

  async function apply() {
    setMessage("Applying…");
    const res = await fetch("/api/quotes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        selectedLineIds: [...selected],
        defaultSectionId: sectionId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Apply failed");
      return;
    }
    router.push(`/projects/${projectId}`);
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={apply}>
          Apply selected quote updates
        </button>
        <label className="muted">New lines section</label>
        <select
          className="field"
          style={{ maxWidth: 220 }}
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {message ? <span className="muted">{message}</span> : null}
      </div>
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th></th>
              <th>Action</th>
              <th>PDF item</th>
              <th>Qty</th>
              <th>Unit price → Quote</th>
              <th>Matched project line</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
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
                <td>{line.action}</td>
                <td>
                  {line.description}
                  {line.sku ? ` (${line.sku})` : ""}
                </td>
                <td>{line.qty ?? "—"}</td>
                <td>
                  {line.unit_price == null ? "—" : formatMoney(line.unit_price)}
                  {line.matched?.quote != null
                    ? ` (was ${formatMoney(line.matched.quote)})`
                    : ""}
                </td>
                <td>{line.matched?.description ?? "— add new —"}</td>
                <td>
                  {line.match_score == null
                    ? "—"
                    : `${(Number(line.match_score) * 100).toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
