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
  const [forcePullImages, setForcePullImages] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const duplicateCount = useMemo(
    () => proposals.filter((p) => p.duplicate).length,
    [proposals],
  );

  async function apply() {
    setMessage(forcePullImages ? "Pulling images & importing…" : "Importing…");
    const res = await fetch("/api/parts/scrape/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        acceptedIds: [...selected],
        forcePullImages,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Import failed");
      return;
    }
    const skipped = Number(data.skippedDuplicates || 0);
    setMessage(
      skipped
        ? `Imported ${data.imported}, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`
        : `Imported ${data.imported}`,
    );
    router.push("/parts");
    router.refresh();
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
        <label
          className="row"
          style={{
            gap: "0.4rem",
            alignItems: "center",
            fontSize: "0.88rem",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={forcePullImages}
            onChange={(e) => setForcePullImages(e.target.checked)}
          />
          Force pull images
        </label>
        {duplicateCount ? (
          <span className="muted">
            {duplicateCount} already in catalog (unchecked)
          </span>
        ) : null}
        {message ? <span className="muted">{message}</span> : null}
      </div>
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
