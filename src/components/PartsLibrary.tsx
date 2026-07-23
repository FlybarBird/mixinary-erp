"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/pricing";
import type { CatalogPart, PartCategory, PartCompany, Vendor } from "@/lib/types";

type PartRow = CatalogPart & {
  category_name?: string;
  company_name?: string;
  vendor_code?: string;
};

export function PartsLibrary({
  canEdit,
  initialCategories,
  initialCompanies,
  vendors,
}: {
  canEdit: boolean;
  initialCategories: PartCategory[];
  initialCompanies: PartCompany[];
  vendors: Vendor[];
}) {
  const router = useRouter();
  const [parts, setParts] = useState<PartRow[]>([]);
  const [categories] = useState(initialCategories);
  const [companies, setCompanies] = useState(initialCompanies);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<CatalogPart> | null>(null);
  const [enrichBrand, setEnrichBrand] = useState("");
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeCompany, setScrapeCompany] = useState("");
  const [scrapeCategory, setScrapeCategory] = useState("");
  const [scrapeForcePullImages, setScrapeForcePullImages] = useState(false);
  const [scraping, setScraping] = useState(false);

  async function createCompany(): Promise<PartCompany | null> {
    const name = window.prompt("New company name")?.trim();
    if (!name) return null;
    const res = await fetch("/api/parts/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Could not create company");
      return null;
    }
    const created = data.data as PartCompany;
    setCompanies((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setMessage(`Added company “${created.name}”`);
    return created;
  }

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (company) params.set("company", company);
    params.set("active", "0");
    const res = await fetch(`/api/parts?${params.toString()}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to load parts");
      return;
    }
    setParts(data.data || []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyNameById = useMemo(
    () => new Map(companies.map((c) => [c.id, c.name])),
    [companies],
  );

  function openNew() {
    setEditing({
      name: "",
      sku: "",
      upc: "",
      description: "",
      category_id: categories[0]?.id ?? null,
      company_id: companies[0]?.id ?? null,
      default_vendor_id: null,
      msrp: 0,
      default_quote: null,
      active: true,
      image_url: null,
    });
    setEnrichBrand(companies[0]?.name ?? "");
  }

  async function savePart(e: FormEvent) {
    e.preventDefault();
    if (!editing?.name) return;
    setMessage(null);
    const res = await fetch("/api/parts", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setEditing(null);
    await load();
  }

  async function enrich() {
    if (!editing) return;
    setMessage("Enriching…");
    const companyName =
      enrichBrand ||
      (editing.company_id
        ? companyNameById.get(editing.company_id) || ""
        : "");
    const res = await fetch("/api/parts/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand: companyName,
        sku: editing.sku,
        upc: editing.upc,
        query: [companyName, editing.sku, editing.name].filter(Boolean).join(" "),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Enrich failed");
      return;
    }
    const result = data.data;
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            name: result.name || prev.name,
            description: result.description || prev.description,
            sku: result.sku || prev.sku,
            upc: result.upc || prev.upc,
            image_url: result.image_url || prev.image_url,
            specs: result.specs || prev.specs,
            source: result.source,
          }
        : prev,
    );
    setMessage(`Enriched via ${result.source}`);
  }

  async function uploadImage(file: File | null) {
    if (!file || !editing?.id) {
      setMessage("Save the part first, then upload an image");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/parts/${editing.id}/image`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Image upload failed");
      return;
    }
    setEditing(data.data);
    await load();
  }

  async function pullRemoteImage() {
    if (!editing?.id || !editing.image_url) {
      setMessage("Save the part and set an image URL first");
      return;
    }
    const form = new FormData();
    form.set("url", editing.image_url);
    const res = await fetch(`/api/parts/${editing.id}/image`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Image download failed");
      return;
    }
    setEditing(data.data);
    await load();
  }

  async function importFile(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    setMessage("Importing…");
    const res = await fetch("/api/parts/import", { method: "POST", body: form });
    const data = await res.json();
    setMessage(
      res.ok
        ? `Imported ${data.created} parts`
        : data.error || "Import failed",
    );
    await load();
  }

  async function runScrape(e: FormEvent) {
    e.preventDefault();
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setMessage("Scraping page…");
    const res = await fetch("/api/parts/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: scrapeUrl.trim(),
        company_id: scrapeCompany || null,
        category_id: scrapeCategory || null,
        force_pull_images: scrapeForcePullImages,
      }),
    });
    const data = await res.json();
    setScraping(false);
    if (!res.ok) {
      setMessage(data.error || "Scrape failed");
      if (data.jobId) {
        router.push(`/review/${data.jobId}`);
      }
      return;
    }
    setScrapeOpen(false);
    setScrapeUrl("");
    setScrapeForcePullImages(false);
    router.push(`/review/${data.jobId}`);
  }

  return (
    <div className="stack">
      <div className="panel" style={{ padding: "1rem" }}>
        <div className="row">
          <input
            className="field"
            style={{ maxWidth: 280 }}
            placeholder="Search name, SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
          <select
            className="field"
            style={{ maxWidth: 180 }}
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
            style={{ maxWidth: 200 }}
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
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            {loading ? "Loading…" : "Search"}
          </button>
          {canEdit ? (
            <>
              <button type="button" className="btn" onClick={openNew}>
                New part
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setScrapeOpen((v) => !v);
                  setScrapeCompany(company || companies[0]?.id || "");
                  setScrapeCategory(category || categories[0]?.id || "");
                }}
              >
                Scrape URL
              </button>
              <label className="btn">
                Import XLSX
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(e) => void importFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </>
          ) : null}
        </div>
        {scrapeOpen && canEdit ? (
          <form
            className="stack"
            style={{ marginTop: "0.85rem" }}
            onSubmit={runScrape}
          >
            <div className="row" style={{ alignItems: "end" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label className="label" htmlFor="scrape-url">
                  Listing / search page URL
                </label>
                <input
                  id="scrape-url"
                  className="field"
                  type="url"
                  required
                  placeholder="https://…"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <label className="label">Default company</label>
                <select
                  className="field"
                  value={scrapeCompany}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__new__") {
                      void createCompany().then((created) => {
                        setScrapeCompany(created?.id || "");
                      });
                      return;
                    }
                    setScrapeCompany(value);
                  }}
                >
                  <option value="">None</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {canEdit ? (
                    <option value="__new__">+ New company…</option>
                  ) : null}
                </select>
              </div>
              <div style={{ minWidth: 160 }}>
                <label className="label">Default category</label>
                <select
                  className="field"
                  value={scrapeCategory}
                  onChange={(e) => setScrapeCategory(e.target.value)}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={scraping}
              >
                {scraping ? "Scraping…" : "Scrape & review"}
              </button>
            </div>
            <label
              className="row"
              style={{
                gap: "0.45rem",
                alignItems: "center",
                fontSize: "0.88rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={scrapeForcePullImages}
                onChange={(e) => setScrapeForcePullImages(e.target.checked)}
              />
              Force pull images
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                (visit each product page for a better photo — slower)
              </span>
            </label>
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Fetches any public page, extracts products with AI, then lets you
              pick which ones to import. Needs an OpenAI key under{" "}
              <a href="/admin/ai-settings" style={{ color: "#0176d3" }}>
                Admin → AI Settings
              </a>
              .
            </p>
          </form>
        ) : null}
        {message ? <p className="muted" style={{ marginBottom: 0 }}>{message}</p> : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: editing ? "1.4fr 1fr" : "1fr",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div className="parts-grid">
          {parts.map((part) => (
            <button
              type="button"
              key={part.id}
              className="part-card"
              onClick={() => {
                setEditing(part);
                setEnrichBrand(
                  part.part_companies?.name ||
                    companyNameById.get(part.company_id || "") ||
                    "",
                );
              }}
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
                  {part.sku || "—"} ·{" "}
                  {part.part_companies?.name ||
                    companyNameById.get(part.company_id || "") ||
                    "—"}
                </div>
                <div style={{ fontWeight: 650 }}>{formatMoney(part.msrp)}</div>
                {!part.active ? (
                  <span className="badge">inactive</span>
                ) : null}
              </div>
            </button>
          ))}
          {!parts.length ? (
            <div className="panel" style={{ padding: "1rem" }}>
              No parts found. {canEdit ? "Create one or import an XLSX." : ""}
            </div>
          ) : null}
        </div>

        {editing ? (
          <form className="panel stack" style={{ padding: "1rem" }} onSubmit={savePart}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{editing.id ? "Edit part" : "New part"}</strong>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>
            {editing.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={editing.image_url}
                alt=""
                style={{
                  width: "100%",
                  maxHeight: 180,
                  objectFit: "contain",
                  background: "#f3f3f3",
                  borderRadius: 6,
                }}
              />
            ) : null}
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                required
                value={editing.name || ""}
                onChange={(e) =>
                  setEditing((p) => (p ? { ...p, name: e.target.value } : p))
                }
              />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="label">SKU</label>
                <input
                  className="field"
                  value={editing.sku || ""}
                  onChange={(e) =>
                    setEditing((p) => (p ? { ...p, sku: e.target.value } : p))
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">UPC</label>
                <input
                  className="field"
                  value={editing.upc || ""}
                  onChange={(e) =>
                    setEditing((p) => (p ? { ...p, upc: e.target.value } : p))
                  }
                />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="field"
                rows={3}
                value={editing.description || ""}
                onChange={(e) =>
                  setEditing((p) =>
                    p ? { ...p, description: e.target.value } : p,
                  )
                }
              />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="label">Category</label>
                <select
                  className="field"
                  value={editing.category_id || ""}
                  onChange={(e) =>
                    setEditing((p) =>
                      p ? { ...p, category_id: e.target.value || null } : p,
                    )
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
                  value={editing.company_id || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__new__") {
                      void createCompany().then((created) => {
                        if (!created) return;
                        setEditing((p) =>
                          p ? { ...p, company_id: created.id } : p,
                        );
                        setEnrichBrand(created.name);
                      });
                      return;
                    }
                    const id = value || null;
                    setEditing((p) => (p ? { ...p, company_id: id } : p));
                    if (id) setEnrichBrand(companyNameById.get(id) || "");
                  }}
                >
                  <option value="">—</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {canEdit ? (
                    <option value="__new__">+ New company…</option>
                  ) : null}
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
                  value={editing.msrp ?? 0}
                  onChange={(e) =>
                    setEditing((p) =>
                      p ? { ...p, msrp: Number(e.target.value) } : p,
                    )
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Default quote</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={editing.default_quote ?? ""}
                  onChange={(e) =>
                    setEditing((p) =>
                      p
                        ? {
                            ...p,
                            default_quote:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }
                        : p,
                    )
                  }
                />
              </div>
            </div>
            <div>
              <label className="label">Default vendor</label>
              <select
                className="field"
                value={editing.default_vendor_id || ""}
                onChange={(e) =>
                  setEditing((p) =>
                    p
                      ? { ...p, default_vendor_id: e.target.value || null }
                      : p,
                  )
                }
              >
                <option value="">—</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Image URL</label>
              <input
                className="field"
                value={editing.image_url || ""}
                onChange={(e) =>
                  setEditing((p) =>
                    p ? { ...p, image_url: e.target.value } : p,
                  )
                }
              />
            </div>
            {canEdit ? (
              <div className="row">
                <button className="btn btn-primary" type="submit">
                  Save
                </button>
                <button type="button" className="btn" onClick={() => void enrich()}>
                  Enrich
                </button>
                <label className="btn">
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) =>
                      void uploadImage(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void pullRemoteImage()}
                >
                  Cache image URL
                </button>
                {editing.id ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      await fetch(`/api/parts?id=${editing.id}`, {
                        method: "DELETE",
                      });
                      setEditing(null);
                      await load();
                    }}
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
              Enrich uses Icecat (brand+SKU) then UPCitemdb. Configure keys in
              .env.local for best results.
            </p>
          </form>
        ) : null}
      </div>
    </div>
  );
}
