"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateLinePricing,
  formatMoney,
  formatSignedMoney,
  outOfPocketStyle,
  sumPricing,
} from "@/lib/pricing";
import type {
  CatalogPart,
  ProjectTemplate,
  TemplateLineItem,
  TemplateSection,
  Vendor,
} from "@/lib/types";
import { CurrencyInput } from "@/components/CurrencyInput";
import { PartPickerModal } from "@/components/PartPickerModal";
import { useDebouncedAutosave } from "@/lib/hooks/useDebouncedAutosave";

type EditableLine = TemplateLineItem & { _key: string };

export function TemplateEditor({
  initialTemplate,
  initialSections,
  initialLines,
  vendors,
  canEdit,
}: {
  initialTemplate: ProjectTemplate;
  initialSections: TemplateSection[];
  initialLines: TemplateLineItem[];
  vendors: Vendor[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [sections, setSections] = useState(initialSections);
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.map((l) => ({ ...l, _key: l.id })),
  );
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  const vendorCodeById = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.code])),
    [vendors],
  );

  const priced = useMemo(
    () =>
      lines.map((line) =>
        calculateLinePricing({
          qty: line.qty,
          msrp: line.msrp,
          quote: line.quote,
          overridePct: line.override_pct,
          projectDefaultOverridePct: template.default_override_pct,
        }),
      ),
    [lines, template.default_override_pct],
  );
  const totals = useMemo(() => sumPricing(priced), [priced]);

  function updateLine(key: string, patch: Partial<TemplateLineItem>) {
    setLines((prev) =>
      prev.map((line) => (line._key === key ? { ...line, ...patch } : line)),
    );
    bump();
  }

  function addLine(
    sectionId: string | null,
    prefill?: Partial<TemplateLineItem>,
  ) {
    const key = `new-${crypto.randomUUID()}`;
    setLines((prev) => [
      ...prev,
      {
        _key: key,
        id: key,
        template_id: template.id,
        section_id: sectionId,
        sort_order: prev.length,
        description: "New item",
        sku: null,
        qty: 1,
        msrp: 0,
        quote: null,
        override_pct: null,
        vendor_code: null,
        notes: null,
        ...prefill,
      },
    ]);
    bump();
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
    bump();
  }

  function addSection() {
    const name = window.prompt("Section name");
    if (!name?.trim()) return;
    const id = `new-section-${crypto.randomUUID()}`;
    setSections((prev) => [
      ...prev,
      {
        id,
        template_id: template.id,
        name: name.trim(),
        sort_order: prev.length,
      },
    ]);
    bump();
  }

  function renameSection(section: TemplateSection) {
    const name = window.prompt("Section name", section.name);
    if (!name?.trim()) return;
    setSections((prev) =>
      prev.map((s) =>
        s.id === section.id ? { ...s, name: name.trim() } : s,
      ),
    );
    bump();
  }

  function removeSection(sectionId: string) {
    const ok = window.confirm(
      "Remove this section? Its lines move to General.",
    );
    if (!ok) return;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    setLines((prev) =>
      prev.map((l) =>
        l.section_id === sectionId ? { ...l, section_id: null } : l,
      ),
    );
    bump();
  }

  function openPicker(sectionId: string | null) {
    setPickerSectionId(sectionId);
    setPickerOpen(true);
  }

  function addFromCatalog(items: Array<{ part: CatalogPart; qty: number }>) {
    for (const { part, qty } of items) {
      addLine(pickerSectionId, {
        description: part.name,
        sku: part.sku,
        qty,
        msrp: Number(part.msrp || 0),
        quote: part.default_quote,
        vendor_code: part.default_vendor_id
          ? vendorCodeById.get(part.default_vendor_id) || null
          : null,
        notes: part.description,
      });
    }
    setMessage(
      `Added ${items.length} catalog part${items.length === 1 ? "" : "s"}`,
    );
  }

  const save = useCallback(async () => {
    if (!canEdit) return;
    setMessage(null);
    const res = await fetch(`/api/templates/${template.id}/contents`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: template.name,
        description: template.description,
        default_override_pct: template.default_override_pct,
        sections: sections.map((s, i) => ({
          ...s,
          sort_order: i,
        })),
        lines: lines.map((l, i) => ({
          ...l,
          sort_order: i,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      throw new Error(data.error || "Save failed");
    }

    const saved = data.data as {
      template: ProjectTemplate;
      sections: TemplateSection[];
      lines: TemplateLineItem[];
    };
    setTemplate(saved.template);
    setSections(saved.sections);
    setLines(saved.lines.map((l) => ({ ...l, _key: l.id })));
    router.refresh();
  }, [canEdit, template, sections, lines, router]);

  useDebouncedAutosave({
    revision,
    enabled: canEdit,
    delayMs: 900,
    save,
  });

  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const unsorted = lines.filter(
    (l) => !l.section_id || !sectionMap.has(l.section_id),
  );
  const grouped = [
    ...sections
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => ({
        section,
        lines: lines
          .filter((l) => l.section_id === section.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      })),
    ...(unsorted.length
      ? [{ section: null as TemplateSection | null, lines: unsorted }]
      : []),
  ];

  return (
    <div className="stack">
      <div className="panel" style={{ padding: "1rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 2fr 0.8fr",
            gap: "0.75rem",
          }}
        >
          <div>
            <label className="label">Name</label>
            <input
              className="field"
              value={template.name}
              disabled={!canEdit}
              onChange={(e) => {
                setTemplate((t) => ({ ...t, name: e.target.value }));
                bump();
              }}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <input
              className="field"
              value={template.description || ""}
              disabled={!canEdit}
              onChange={(e) => {
                setTemplate((t) => ({
                  ...t,
                  description: e.target.value || null,
                }));
                bump();
              }}
            />
          </div>
          <div>
            <label className="label">Default override %</label>
            <input
              className="field"
              type="number"
              step="0.01"
              disabled={!canEdit}
              value={Number((template.default_override_pct * 100).toFixed(4))}
              onChange={(e) => {
                setTemplate((t) => ({
                  ...t,
                  default_override_pct: Number(e.target.value || 0) / 100,
                }));
                bump();
              }}
            />
          </div>
        </div>
      </div>

      <div className="row">
        {canEdit ? (
          <>
            <button type="button" className="btn" onClick={addSection}>
              Add section
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => addLine(sections[0]?.id ?? null)}
            >
              Add line
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => openPicker(sections[0]?.id ?? null)}
            >
              Pick part
            </button>
          </>
        ) : null}
        {message ? <span className="muted">{message}</span> : null}
      </div>

      <div className="row" style={{ gap: "1.25rem" }}>
        <span>MSRP {formatMoney(totals.totalMsrp)}</span>
        <span>Quote {formatMoney(totals.totalQuote)}</span>
        <span>Sale {formatMoney(totals.totalSale)}</span>
        <span style={outOfPocketStyle(totals.outOfPocket, totals.totalQuote)}>
          Quoted Material Profit {formatSignedMoney(totals.outOfPocket)}
        </span>
      </div>

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th>QTY</th>
              <th>MSRP</th>
              <th>Quote</th>
              <th>%</th>
              <th>Sale</th>
              <th>Vendor</th>
              <th>Notes</th>
              {canEdit ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ section, lines: groupLines }) => (
              <Fragment key={section?.id ?? "general"}>
                <tr className="section-row">
                  <td colSpan={canEdit ? 10 : 9}>
                    <div className="section-bar">
                      <span>{section?.name ?? "General"}</span>
                      {canEdit ? (
                        <div className="row">
                          {section ? (
                            <>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => renameSection(section)}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => removeSection(section.id)}
                              >
                                Remove section
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="btn"
                            onClick={() => addLine(section?.id ?? null)}
                          >
                            Add line
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => openPicker(section?.id ?? null)}
                          >
                            Pick part
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {groupLines.map((line) => {
                  const price = calculateLinePricing({
                    qty: line.qty,
                    msrp: line.msrp,
                    quote: line.quote,
                    overridePct: line.override_pct,
                    projectDefaultOverridePct: template.default_override_pct,
                  });
                  return (
                    <tr key={line._key}>
                      <td>
                        <input
                          className="field"
                          value={line.description}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateLine(line._key, {
                              description: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="field"
                          value={line.sku || ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateLine(line._key, {
                              sku: e.target.value || null,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="field"
                          type="number"
                          step="0.01"
                          value={line.qty}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateLine(line._key, {
                              qty: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td>
                        <CurrencyInput
                          value={line.msrp}
                          disabled={!canEdit}
                          onChange={(value) =>
                            updateLine(line._key, { msrp: value ?? 0 })
                          }
                        />
                      </td>
                      <td>
                        <CurrencyInput
                          value={line.quote}
                          allowEmpty
                          isDefault={line.quote == null}
                          defaultDisplay={line.msrp}
                          disabled={!canEdit}
                          onChange={(value) =>
                            updateLine(line._key, { quote: value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="field"
                          type="number"
                          step="0.01"
                          disabled={!canEdit}
                          placeholder={(
                            template.default_override_pct * 100
                          ).toFixed(2)}
                          value={
                            line.override_pct == null
                              ? ""
                              : Number((line.override_pct * 100).toFixed(4))
                          }
                          onChange={(e) =>
                            updateLine(line._key, {
                              override_pct:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value) / 100,
                            })
                          }
                        />
                      </td>
                      <td>{formatMoney(price.unitSale)}</td>
                      <td>
                        <select
                          className="field"
                          disabled={!canEdit}
                          value={line.vendor_code || ""}
                          onChange={(e) =>
                            updateLine(line._key, {
                              vendor_code: e.target.value || null,
                            })
                          }
                        >
                          <option value="">—</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.code}>
                              {v.code}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="field"
                          value={line.notes || ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateLine(line._key, {
                              notes: e.target.value || null,
                            })
                          }
                        />
                      </td>
                      {canEdit ? (
                        <td>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => removeLine(line._key)}
                          >
                            Delete
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {!lines.length ? (
              <tr>
                <td colSpan={canEdit ? 10 : 9}>
                  No lines yet. Add a section or line to get started.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PartPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={addFromCatalog}
      />
    </div>
  );
}
