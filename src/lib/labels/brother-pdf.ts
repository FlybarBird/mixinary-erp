import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import {
  BROTHER_LABEL,
  buildLabelPrintRows,
  buildReceiveQrUrl,
  type LabelMode,
  type LabelPrintRow,
  type LabelSourceItem,
} from "@mixinary/domain";

export type LabelSheetMeta = {
  projectId: string;
  poNumber: string;
  vendorName: string;
  jobName: string;
  mode: LabelMode;
  origin: string;
  items: LabelSourceItem[];
};

const MM_TO_PT = 72 / 25.4;

function mm(n: number) {
  return n * MM_TO_PT;
}

async function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    margin: 1,
    width: 280,
    errorCorrectionLevel: "M",
  });
}

function drawLabel(
  doc: PDFKit.PDFDocument,
  row: LabelPrintRow,
  meta: LabelSheetMeta,
  qr: Buffer,
) {
  const w = mm(BROTHER_LABEL.widthMm);
  const h = mm(BROTHER_LABEL.heightMm);
  const pad = mm(2.5);
  const qrSize = mm(28);
  const qrX = w - pad - qrSize;
  const qrY = (h - qrSize) / 2;
  const textW = qrX - pad * 2;

  doc.rect(0, 0, w, h).stroke("#cccccc");

  let y = pad;
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(9);
  doc.text(meta.poNumber || "PO", pad, y, { width: textW, height: mm(5) });
  y += mm(5.5);

  if (meta.mode === "receive") {
    doc.font("Helvetica").fontSize(7).fillColor("#333");
    doc.text(meta.vendorName || "Vendor", pad, y, {
      width: textW,
      height: mm(4.5),
      ellipsis: true,
    });
    y += mm(5);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
    doc.text(row.description || "—", pad, y, {
      width: textW,
      height: mm(12),
      ellipsis: true,
    });
    y += mm(13);
    doc.font("Helvetica").fontSize(7).fillColor("#333");
    doc.text(`SKU ${row.sku || "—"}  ·  Qty ${row.qtyOrdered}`, pad, y, {
      width: textW,
      height: mm(4),
    });
    y += mm(5);
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#000");
    doc.text("RECEIVE", pad, y, { width: textW });
  } else {
    doc.font("Helvetica").fontSize(7).fillColor("#333");
    doc.text(meta.jobName || "Job", pad, y, {
      width: textW,
      height: mm(4.5),
      ellipsis: true,
    });
    y += mm(5);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
    doc.text(row.description || "—", pad, y, {
      width: textW,
      height: mm(11),
      ellipsis: true,
    });
    y += mm(12);
    doc.font("Helvetica").fontSize(7).fillColor("#333");
    doc.text(`SKU ${row.sku || "—"}`, pad, y, { width: textW });
    y += mm(5);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000");
    doc.text(`(${row.pieceIndex}/${row.pieceTotal})`, pad, y, {
      width: textW,
    });
  }

  doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });
}

/** Multi-page PDF sized for Brother QL 62mm continuous stock. */
export async function buildBrotherLabelPdf(
  meta: LabelSheetMeta,
): Promise<{ buffer: Buffer; rowCount: number; truncated: boolean }> {
  const { rows, truncated } = buildLabelPrintRows(meta.items, meta.mode);
  const pageW = mm(BROTHER_LABEL.widthMm);
  const pageH = mm(BROTHER_LABEL.heightMm);

  const qrByItem = new Map<string, Buffer>();
  for (const id of new Set(rows.map((r) => r.itemId))) {
    const url = buildReceiveQrUrl({
      origin: meta.origin,
      projectId: meta.projectId,
      itemId: id,
    });
    qrByItem.set(id, await qrPng(url));
  }

  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    info: {
      Title: `Mixinary ${meta.mode} labels — ${meta.poNumber}`,
      Author: "Mixinary ERP",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (const row of rows) {
    doc.addPage({ size: [pageW, pageH], margin: 0 });
    const qr = qrByItem.get(row.itemId)!;
    drawLabel(doc, row, meta, qr);
  }

  if (rows.length === 0) {
    doc.addPage({ size: [pageW, pageH], margin: 0 });
    doc.font("Helvetica").fontSize(9).text("No labels", mm(4), mm(4));
  }

  doc.end();
  const buffer = await done;
  return { buffer, rowCount: rows.length, truncated };
}
