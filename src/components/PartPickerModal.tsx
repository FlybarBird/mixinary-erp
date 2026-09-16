"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { CatalogPart, PartCategory, PartCompany } from "@/lib/types";

type PickerTab = "search" | "new";

type DraftPart = {
  name: string;
  sku: string;
  upc: string;
  description: string;
  category_id: string;
  company_id: string;
  msrp: number;
  default_quote: string;
  qty: number;
};

function emptyDraft(prefillName = ""): DraftPart {
  return {
    name: prefillName,
    sku: "",
    upc: "",
    description: "",
    category_id: "",
    company_id: "",
    msrp: 0,
    default_quote: "",
    qty: 1,
  };
}

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
  const [tab, setTab] = useState<PickerTab>("search");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState("");
  const [categories, setCategories] = useState<PartCategory[]>([]);
  const [companies, setCompanies] = useState<PartCompany[]>([]);
  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [draft, setDraft] = useState<DraftPart>(emptyDraft());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
    setSearched(true);
    setParts(data.data || []);
  }

  function openNewItem(prefillName = "") {
    setCreateError(null);
    setDraft(emptyDraft(prefillName));
    setTab("new");
  }

  async function createPart(e: FormEvent, mode: "select" | "add") {
    e.preventDefault();
    if (!draft.name.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        upc: draft.upc.trim() || null,
        description: draft.description.trim() || null,
        category_id: draft.category_id || null,
        company_id: draft.company_id || null,
        msrp: Number(draft.msrp) || 0,
        default_quote:
          draft.default_quote === "" ? null : Number(draft.default_quote),
        active: true,
        source: "manual",
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setCreateError(data.error || "Could not create part");
      return;
    }

    const created = data.data as CatalogPart;
    const companyMeta = companies.find((c) => c.id === created.company_id);
    const categoryMeta = categories.find((c) => c.id === created.category_id);
    const part: CatalogPart = {
      ...created,
      part_companies: companyMeta ?? created.part_companies ?? null,
      part_categories: categoryMeta ?? created.part_categories ?? null,
    };
    const qty = Math.max(1, Number(draft.qty) || 1);

    if (mode === "add") {
      onAdd([{ part, qty }]);
      setSelected({});
      setDraft(emptyDraft());
      onClose();
      return;
    }

    setParts((prev) => [part, ...prev.filter((p) => p.id !== part.id)]);
    setSelected((prev) => ({ ...prev, [part.id]: qty }));
    setDraft(emptyDraft());
    setTab("search");
    setSearched(true);
  }

  useEffect(() => {
    if (!open) return;
    setTab("search");
    setQ("");
    setCategory("");
    setCompany("");
    setSelected({});
    setSearched(false);
    setCreateError(null);
    setDraft(emptyDraft());
    void loadMeta();
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const selectedList = Object.entries(selected)
    .map(([id, qty]) => {
      const part = parts.find((p) => p.id === id);
      return part ? { part, qty } : null;
    })
    .filter(Boolean) as Array<{ part: CatalogPart; qty: number }>;

  const showEmptyCreate = searched && !loading && !parts.length;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Pick parts</h2>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              Search the catalog or create a new item for this BOM section.
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="picker-tabs" role="tablist" aria-label="Part picker">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "search"}
            className={`picker-tab${tab === "search" ? " active" : ""}`}
            onClick={() => setTab("search")}
          >
            Search
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "new"}
            className={`picker-tab${tab === "new" ? " active" : ""}`}
            onClick={() => {
              if (tab !== "new") openNewItem(q.trim());
            }}
          >
            New item
          </button>
        </div>

        {tab === "search" ? (
          <>
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void search()}
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>

            <div
              className="parts-grid"
              style={{ marginTop: "1rem", maxHeight: 420, overflow: "auto" }}
            >
              {parts.map((part) => {
                const qty = selected[part.id];
                return (
                  <div
                    key={part.id}
                    className={`part-card static ${qty ? "selected" : ""}`}
                  >
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
                      <div style={{ fontWeight: 650 }}>
                        {formatMoney(part.msrp)}
                      </div>
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
                                [part.id]: Math.max(
                                  1,
                                  Number(e.target.value) || 1,
                                ),
                              }))
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {showEmptyCreate ? (
                <button
                  type="button"
                  className="part-card picker-empty-create"
                  onClick={() => openNewItem(q.trim())}
                >
                  <div className="picker-empty-create-mark" aria-hidden="true">
                    +
                  </div>
                  <div className="part-meta">
                    <div className="part-name">New item</div>
                    <div className="muted">
                      No matching parts
                      {q.trim() ? ` for “${q.trim()}”` : ""}. Create one in the
                      catalog.
                    </div>
                  </div>
                </button>
              ) : null}

              {!searched && !parts.length && !loading ? (
                <div className="muted">Search the catalog to pick parts.</div>
              ) : null}
            </div>

            <div
              className="row"
              style={{ marginTop: "1rem", justifyContent: "flex-end" }}
            >
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
          </>
        ) : (
          <form
            className="stack"
            style={{ marginTop: "1rem" }}
            onSubmit={(e) => void createPart(e, "add")}
          >
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                required
                autoFocus
                value={draft.name}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="label">SKU</label>
                <input
                  className="field"
                  value={draft.sku}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, sku: e.target.value }))
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">UPC</label>
                <input
                  className="field"
                  value={draft.upc}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, upc: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="field"
                rows={2}
                value={draft.description}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="label">Category</label>
                <select
                  className="field"
                  value={draft.category_id}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      category_id: e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Company</label>
                <select
                  className="field"
                  value={draft.company_id}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      company_id: e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="label">MSRP</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  min={0}
                  value={draft.msrp}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      msrp: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Default quote</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  min={0}
                  value={draft.default_quote}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      default_quote: e.target.value,
                    }))
                  }
                />
              </div>
              <div style={{ width: 100 }}>
                <label className="label">Qty</label>
                <input
                  className="field"
                  type="number"
                  min={1}
                  value={draft.qty}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      qty: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </div>
            </div>

            {createError ? (
              <div className="muted" style={{ color: "var(--danger, #b42318)" }}>
                {createError}
              </div>
            ) : null}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                disabled={creating}
                onClick={(e) => void createPart(e, "select")}
              >
                {creating ? "Creating…" : "Create & select"}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating || !draft.name.trim()}
              >
                {creating ? "Creating…" : "Create & add to BOM"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
