"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";

export type LabelItem = {
  id: string;
  description: string;
  sku: string | null;
  qty_ordered: number;
};

type Props = {
  projectId: string;
  poNumber: string;
  vendorName: string;
  items: LabelItem[];
};

export function QrLabelSheet({ projectId, poNumber, vendorName, items }: Props) {
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const payloads = useMemo(() => {
    if (!origin) return [];
    return items.map((item) => ({
      id: item.id,
      url: `${origin}/projects/${projectId}/receive?item=${item.id}`,
    }));
  }, [items, origin, projectId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const next: Record<string, string> = {};
      for (const p of payloads) {
        next[p.id] = await QRCode.toDataURL(p.url, {
          margin: 1,
          width: 220,
          errorCorrectionLevel: "M",
        });
      }
      if (!cancelled) setDataUrls(next);
    }
    if (payloads.length) void run();
    return () => {
      cancelled = true;
    };
  }, [payloads]);

  return (
    <div className="qr-label-sheet">
      <div className="qr-label-toolbar no-print">
        <Link className="btn" href={`/projects/${projectId}/procurement`}>
          ← Procurement
        </Link>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.print()}
        >
          Print labels
        </button>
        <span className="qr-label-toolbar-meta">
          {poNumber} · {items.length} label{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="qr-label-grid">
        {items.map((item) => (
          <div key={item.id} className="qr-label-card">
            {dataUrls[item.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrls[item.id]} alt={`QR ${item.description}`} />
            ) : (
              <div className="qr-label-placeholder">Generating…</div>
            )}
            <div className="qr-label-meta">
              <div className="qr-label-po">{poNumber}</div>
              <div className="qr-label-vendor">{vendorName}</div>
              <div className="qr-label-desc">{item.description}</div>
              <div className="qr-label-sku">
                SKU {item.sku || "—"} · Qty {item.qty_ordered}
              </div>
            </div>
          </div>
        ))}
        {!items.length ? (
          <p style={{ color: "var(--muted)" }}>No items on this PO.</p>
        ) : null}
      </div>
    </div>
  );
}
