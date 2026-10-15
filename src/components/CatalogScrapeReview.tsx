"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/pricing";

type Proposal = {
  id: string;
  name: string;
  sku: string | null;
  upc: string | null;
  description: string | null;
  msrp: number | null;
  image_url: string | null;
  product_url: string | null;
  brand: string | null;
  company_name: string | null;
  source_name: string | null;
  confidence: number | null;
  duplicate?: {
    id: string;
    name: string;
    reason: string;
  } | null;
};

const REASON_LABEL: Record<string, string> = {
  upc: "UPC",
  sku: "SKU",
  product_url: "URL",
  name: "name",
};

export function CatalogScrapeReview({
  jobId,
  proposals,
}: {
  jobId: string;
  proposals: Proposal[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(proposals.filter((p) => !p.duplicate).map((p) => p.id)),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState<Array<{ name: string; error: string }>>(
    [],
  );

  const duplicateCount = useMemo(
    () => proposals.filter((p) => p.duplicate).length,
    [proposals],
  );

  async function apply() {
    setFailures([]);
    setMessage("Adding devices to the catalog…");
    const res = await fetch("/api/parts/scrape/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        acceptedIds: [...selected],
      }),
    });
    const data = await res.json();
    if (!res.ok && !Array.isArray(data.failures)) {
      setMessage(data.error || "Import failed");
      return;
    }
    const skipped = Number(data.skippedDuplicates || 0);
    const imported = Number(data.imported || 0);
    const failed = Array.isArray(data.failures) ? data.failures : [];
    setFailures(failed);
    const bits = [`Added ${imported}`];
    if (skipped) {
      bits.push(`skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`);
    }
    if (failed.length) {
      bits.push(`${failed.length} failed`);
    }
    setMessage(bits.join(", "));
    if (imported > 0 && failed.length === 0) {
      router.push("/parts");
      router.refresh();
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={apply}>
          Import selected ({selected.size})
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            setSelected(
              new Set(proposals.filter((p) => !p.duplicate).map((p) => p.id)),
            )
          }
        >
          Select new only
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setSelected(new Set(proposals.map((p) => p.id)))}
        >
          Select all
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setSelected(new Set())}
        >
          Clear
        </button>
        {duplicateCount ? (
          <span className="muted">
            {duplicateCount} already in catalog (unchecked)
          </span>
        ) : null}
        {message ? <span className="muted">{message}</span> : null}
      </div>
      {failures.length ? (
        <div className="panel" style={{ padding: "0.75rem 1rem" }}>
          {failures.map((failure) => (
            <div key={`${failure.name}-${failure.error}`} className="muted">
              {failure.name}: {failure.error}
            </div>
          ))}
        </div>
      ) : null}
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th></th>
              <th>Image</th>
              <th>Name</th>
              <th>Brand</th>
              <th>Company</th>
              <th>SKU</th>
              <th>MSRP</th>
              <th>Source</th>
              <th>Confidence</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr
                key={p.id}
                style={
                  p.duplicate
                    ? { opacity: 0.65, background: "rgba(120,100,160,0.06)" }
                    : undefined
                }
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      });
                    }}
                  />
                </td>
                <td>
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt=""
                      style={{
                        width: 48,
                        height: 48,
                        objectFit: "contain",
                        background: "#f3f3f3",
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <div style={{ fontWeight: 650 }}>{p.name}</div>
                  {p.duplicate ? (
                    <div
                      className="muted"
                      style={{ fontSize: "0.78rem", color: "#8a6d3b" }}
                    >
                      Duplicate ({REASON_LABEL[p.duplicate.reason] || p.duplicate.reason}
                      ): {p.duplicate.name}
                    </div>
                  ) : null}
                  {p.description ? (
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {p.description.slice(0, 120)}
                      {p.description.length > 120 ? "…" : ""}
                    </div>
                  ) : null}
                </td>
                <td>{p.brand || "—"}</td>
                <td>{p.company_name || p.brand || "—"}</td>
                <td>{p.sku || "—"}</td>
                <td>{p.msrp == null ? "—" : formatMoney(p.msrp)}</td>
                <td>{p.source_name || "—"}</td>
                <td>
                  {p.confidence == null
                    ? "—"
                    : `${(Number(p.confidence) * 100).toFixed(0)}%`}
                </td>
                <td>
                  {p.product_url ? (
                    <a
                      href={p.product_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0176d3" }}
                    >
                      Open
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!proposals.length ? (
              <tr>
                <td colSpan={10}>No proposals.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
