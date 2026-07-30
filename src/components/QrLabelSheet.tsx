"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  buildLabelPrintRows,
  buildReceiveQrUrl,
  BROTHER_LABEL,
  MAX_LABELS,
  type LabelMode,
} from "@mixinary/domain";
import {
  initDymo,
  listLabelWriters,
  printLabels,
  resolvePrinter,
  storePrinterName,
  type DymoPrinter,
} from "@/lib/dymo/client";
import { buildDymoLabelXml } from "@/lib/dymo/label-xml";

export type { LabelMode };

export type LabelItem = {
  id: string;
  description: string;
  sku: string | null;
  qty_ordered: number;
};

type Props = {
  projectId: string;
  poId: string;
  poNumber: string;
  vendorName: string;
  jobName: string;
  mode: LabelMode;
  items: LabelItem[];
};

export function QrLabelSheet({
  projectId,
  poId,
  poNumber,
  vendorName,
  jobName,
  mode,
  items,
}: Props) {
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );
  const [printers, setPrinters] = useState<DymoPrinter[]>([]);
  const [printerName, setPrinterName] = useState("");
  const [dymoReady, setDymoReady] = useState(false);
  const [dymoMessage, setDymoMessage] = useState("Checking DYMO Connect…");
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const { rows, truncated } = useMemo(
    () => buildLabelPrintRows(items, mode),
    [items, mode],
  );

  const itemIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.itemId))),
    [rows],
  );

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    async function run() {
      const next: Record<string, string> = {};
      for (const id of itemIds) {
        const url = buildReceiveQrUrl({
          origin,
          projectId,
          itemId: id,
        });
        next[id] = await QRCode.toDataURL(url, {
          margin: 1,
          width: 280,
          errorCorrectionLevel: "M",
        });
      }
      if (!cancelled) setDataUrls(next);
    }
    if (itemIds.length) void run();
    return () => {
      cancelled = true;
    };
  }, [itemIds, origin, projectId]);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      try {
        const { framework, ready, message } = await initDymo();
        if (cancelled) return;
        setDymoReady(ready);
        setDymoMessage(message);
        if (!ready) {
          setPrinters([]);
          return;
        }
        const list = listLabelWriters(framework);
        setPrinters(list);
        const chosen = resolvePrinter(list);
        setPrinterName(chosen?.name ?? "");
        if (!list.length) {
          setDymoMessage(
            "DYMO Connect is running, but no LabelWriter was found. Check USB.",
          );
          setDymoReady(false);
        }
      } catch (err) {
        if (cancelled) return;
        setDymoReady(false);
        setPrinters([]);
        setDymoMessage(
          err instanceof Error
            ? err.message
            : "Install and open DYMO Connect, then reconnect your LabelWriter.",
        );
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  function modeHref(next: LabelMode) {
    return `/projects/${projectId}/receive/labels?po=${poId}&mode=${next}`;
  }

  async function printWithDymo() {
    setPrinting(true);
    setStatus(null);
    try {
      const { framework, ready, message } = await initDymo();
      if (!ready) throw new Error(message);
      const list = listLabelWriters(framework);
      setPrinters(list);
      const chosen =
        resolvePrinter(list, printerName) ?? resolvePrinter(list);
      if (!chosen) {
        throw new Error(
          "No DYMO LabelWriter found. Connect the printer in DYMO Connect.",
        );
      }
      setPrinterName(chosen.name);
      storePrinterName(chosen.name);

      const xmls: string[] = [];
      for (const row of rows) {
        const qr = dataUrls[row.itemId];
        if (!qr) throw new Error("QR codes are still generating — try again.");
        if (mode === "receive") {
          xmls.push(
            buildDymoLabelXml({
              mode: "receive",
              poNumber,
              vendorName,
              description: row.description,
              sku: row.sku,
              qtyOrdered: row.qtyOrdered,
              qrDataUrl: qr,
            }),
          );
        } else {
          xmls.push(
            buildDymoLabelXml({
              mode: "item",
              poNumber,
              jobName,
              description: row.description,
              sku: row.sku,
              pieceIndex: row.pieceIndex ?? 1,
              pieceTotal: row.pieceTotal ?? 1,
              qrDataUrl: qr,
            }),
          );
        }
      }
      await printLabels(framework, chosen.name, xmls);
      setStatus(`Sent ${xmls.length} label${xmls.length === 1 ? "" : "s"} to ${chosen.name}.`);
      setDymoReady(true);
      setDymoMessage("DYMO Connect ready");
    } catch (err) {
      setDymoReady(false);
      setStatus(
        err instanceof Error
          ? err.message
          : "DYMO print failed. Use browser print as a fallback.",
      );
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="qr-label-sheet" data-mode={mode}>
      <div className="qr-label-toolbar no-print">
        <Link className="btn" href={`/projects/${projectId}/procurement`}>
          ← Procurement
        </Link>
        <div className="segmented" role="tablist" aria-label="Label type">
          <Link
            href={modeHref("receive")}
            className={`btn ${mode === "receive" ? "btn-active" : ""}`}
          >
            Receive labels
          </Link>
          <Link
            href={modeHref("item")}
            className={`btn ${mode === "item" ? "btn-active" : ""}`}
          >
            Item labels
          </Link>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={printing || !rows.length || !Object.keys(dataUrls).length}
          onClick={() => void printWithDymo()}
        >
          {printing ? "Printing…" : "Print to DYMO"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!rows.length}
          onClick={() => window.print()}
          title="Fallback when DYMO Connect is unavailable"
        >
          Print via browser…
        </button>
        <span className="qr-label-toolbar-meta">
          {poNumber} · {mode === "item" ? "Item" : "Receive"} · {rows.length}{" "}
          label{rows.length !== 1 ? "s" : ""} · {jobName}
        </span>
      </div>

      <div className="qr-label-dymo-bar no-print">
        <label className="qr-label-printer">
          <span>LabelWriter</span>
          <select
            className="field-light"
            value={printerName}
            disabled={!printers.length}
            onChange={(e) => {
              setPrinterName(e.target.value);
              if (e.target.value) storePrinterName(e.target.value);
            }}
          >
            {!printers.length ? (
              <option value="">No printer detected</option>
            ) : (
              printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.isConnected ? "" : " (offline)"}
                </option>
              ))
            )}
          </select>
        </label>
        <span
          className="qr-label-dymo-status"
          data-ready={dymoReady ? "true" : "false"}
        >
          {dymoMessage}
        </span>
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          Desktop: DYMO 1.8″ × 3.1″ via DYMO Connect. iPad app uses Brother QL
          {" "}
          {BROTHER_LABEL.widthMm}mm ({BROTHER_LABEL.recommendedModels.join(" / ")})
          {" "}
          — PDF also at{" "}
          <Link
            href={`/api/projects/${projectId}/labels/pdf?po=${poId}&mode=${mode}`}
          >
            Brother PDF
          </Link>
          .
        </span>
      </div>

      {truncated ? (
        <p className="qr-label-warning no-print">
          Showing the first {MAX_LABELS} labels only — reduce quantities or
          print in batches.
        </p>
      ) : null}
      {status ? (
        <p className="qr-label-status no-print" style={{ margin: 0 }}>
          {status}
        </p>
      ) : null}

      <div className="qr-label-grid">
        {rows.map((row) => (
          <div key={row.key} className="qr-label-card" data-mode={mode}>
            {dataUrls[row.itemId] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrls[row.itemId]}
                alt={`QR ${row.description}`}
              />
            ) : (
              <div className="qr-label-placeholder">Generating…</div>
            )}
            <div className="qr-label-meta">
              <div className="qr-label-po">{poNumber}</div>
              {mode === "receive" ? (
                <div className="qr-label-vendor">{vendorName}</div>
              ) : (
                <div className="qr-label-job">{jobName}</div>
              )}
              <div className="qr-label-desc">{row.description}</div>
              {mode === "receive" ? (
                <div className="qr-label-sku">
                  SKU {row.sku || "—"} · Qty {row.qtyOrdered}
                </div>
              ) : (
                <>
                  <div className="qr-label-sku">SKU {row.sku || "—"}</div>
                  <div className="qr-label-piece">
                    ({row.pieceIndex}/{row.pieceTotal})
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {!rows.length ? (
          <p style={{ color: "var(--muted)" }}>No items on this PO.</p>
        ) : null}
      </div>
    </div>
  );
}
