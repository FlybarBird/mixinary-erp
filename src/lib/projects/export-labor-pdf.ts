import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatMoney, formatSignedMoney } from "@/lib/pricing";
import {
  laborExportTotals,
  laborLinePricing,
  sortLaborLines,
} from "@/lib/projects/labor-export";
import type { LaborEntry } from "@/lib/types";

function resolveLogoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public/brand/logo-2.png"),
    path.join(process.cwd(), "public/brand/logo-1.png"),
    path.join(process.cwd(), "public/brand/mark.png"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export async function buildLaborPdf(params: {
  projectNumber: string;
  projectName: string;
  clientName: string | null;
  includePricing: boolean;
  lines: LaborEntry[];
  defaultOverridePct?: number | null;
}): Promise<Buffer> {
  const {
    projectNumber,
    projectName,
    clientName,
    includePricing,
    lines,
    defaultOverridePct = 0,
  } = params;
  const sorted = sortLaborLines(lines);
  const totals = laborExportTotals(sorted, defaultOverridePct);

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 40,
    layout: "landscape",
    info: {
      Title: `${projectNumber} Labor`,
      Author: "Mixinary ERP",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const left = doc.page.margins.left;
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const logoPath = resolveLogoPath();
  const headerTop = doc.y;
  if (logoPath) {
    try {
      doc.image(logoPath, left, headerTop, { fit: [120, 28] });
    } catch {
      /* ignore */
    }
  }
  const titleX = logoPath ? left + 134 : left;
  doc
    .fillColor("#223548")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Labor", titleX, headerTop, { width: pageWidth - 134 });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#556")
    .text(
      `${projectNumber} · ${projectName}${clientName ? ` · ${clientName}` : ""}`,
      titleX,
      doc.y + 2,
      { width: pageWidth - 134 },
    );

  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(9).fillColor("#223548");
  const summaryParts = [`Qty ${totals.qty}`];
  if (includePricing) {
    summaryParts.push(
      `EST ${formatMoney(totals.totalMsrp)}`,
      `Quote ${formatMoney(totals.totalQuote)}`,
      `Sale ${formatMoney(totals.totalSale)}`,
      `Profit ${formatSignedMoney(totals.profit)}`,
    );
  }
  doc.text(summaryParts.join("   ·   "), left, doc.y, { width: pageWidth });
  doc.moveDown(0.8);

  const colItem = left;
  const colQty = left + pageWidth * 0.38;
  const colQuote = left + pageWidth * 0.48;
  const colSale = left + pageWidth * 0.64;
  const colStatus = left + pageWidth * 0.82;

  function ensureSpace(h: number) {
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  ensureSpace(40);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#667");
  const yHead = doc.y;
  doc.text("Item", colItem, yHead, { width: pageWidth * 0.36 });
  doc.text("Qty", colQty, yHead, { width: 40, align: "right" });
  if (includePricing) {
    doc.text("Quote", colQuote, yHead, { width: 70, align: "right" });
    doc.text("Sale", colSale, yHead, { width: 70, align: "right" });
  }
  doc.text("Status", colStatus, yHead, { width: 60 });
  doc.moveDown(0.35);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + pageWidth, doc.y)
    .strokeColor("#ccd")
    .stroke();
  doc.moveDown(0.25);

  for (const line of sorted) {
    ensureSpace(18);
    const pricing = laborLinePricing(line, defaultOverridePct);
    const y = doc.y;
    doc.font("Helvetica").fontSize(8).fillColor("#223548");
    const desc = line.task_description || line.worker_name || "Labor";
    doc.text(desc, colItem, y, { width: pageWidth * 0.36, lineBreak: false });
    doc.text(String(pricing.qty), colQty, y, { width: 40, align: "right" });
    if (includePricing) {
      doc.text(formatMoney(pricing.totalQuote), colQuote, y, {
        width: 70,
        align: "right",
      });
      doc.text(formatMoney(pricing.totalSale), colSale, y, {
        width: 70,
        align: "right",
      });
    }
    doc.text(String(line.approval_status || ""), colStatus, y, {
      width: 60,
    });
    doc.y = y + 12;
  }

  doc.end();

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
