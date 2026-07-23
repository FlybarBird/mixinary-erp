"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { CatalogPart, PartCategory, PartCompany } from "@/lib/types";

export function PartPickerModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (
    parts: Array<{ part: CatalogPart; qty: number }>,
  ) => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState("");
  const [categories, setCategories] = useState<PartCategory[]>([]);
  const [companies, setCompanies] = useState<PartCompany[]>([]);
  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  async function loadMeta() {
    const [cRes, coRes] = await Promise.all([
      fetch("/api/parts/categories"),
      fetch("/api/parts/companies"),
    ]);
    const cData = await cRes.json();
    const coData = await coRes.json();
    setCategories(cData.data || []);
    setCompanies(coData.data || []);
  }

  async function search() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (company) params.set("company", company);
    const res = await fetch(`/api/parts?${params.toString()}`);
    const data = await res.json();
    setLoading(false);
    setParts(data.data || []);
  }

  useEffect(() => {
    if (!open) return;
    void loadMeta();
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const selectedList = parts
    .filter((p) => selected[p.id])
    .map((p) => ({ part: p, qty: selected[p.id] || 1 }));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Pick parts</h2>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              Search the catalog and add items to this BOM section.
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="row" style={{ marginTop: "1rem" }}>
          <input
            className="field"
            style={{ maxWidth: 260 }}
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
          <select
            className="field"
            style={{ maxWidth: 160 }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="field"
            style={{ maxWidth: 180 }}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => void search()}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="parts-grid" style={{ marginTop: "1rem", maxHeight: 420, overflow: "auto" }}>
          {parts.map((part) => {
            const qty = selected[part.id];
            return (
              <div key={part.id} className={`part-card static ${qty ? "selected" : ""}`}>
                <div className="part-thumb">
                  {part.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={part.image_url} alt={part.name} />
                  ) : (
                    <span>No image</span>
                  )}
                </div>
                <div className="part-meta">
                  <div className="part-name">{part.name}</div>
                  <div className="muted">
                    {part.sku || "—"} · {part.part_companies?.name || "—"}
                  </div>
                  <div style={{ fontWeight: 650 }}>{formatMoney(part.msrp)}</div>
                  <div className="row" style={{ marginTop: "0.35rem" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = { ...prev };
                          if (next[part.id]) delete next[part.id];
                          else next[part.id] = 1;
                          return next;
                        })
                      }
                    >
                      {qty ? "Selected" : "Select"}
                    </button>
                    {qty ? (
                      <input
                        className="field"
                        style={{ width: 70 }}
                        type="number"
                        min={1}
                        value={qty}
                        onChange={(e) =>
                          setSelected((prev) => ({
                            ...prev,
                            [part.id]: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {!parts.length ? (
            <div className="muted">No matching parts.</div>
          ) : null}
        </div>

        <div className="row" style={{ marginTop: "1rem", justifyContent: "flex-end" }}>
          <span className="muted">{selectedList.length} selected</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedList.length}
            onClick={() => {
              onAdd(selectedList);
              setSelected({});
              onClose();
            }}
          >
            Add to BOM
          </button>
        </div>
      </div>
    </div>
  );
}
