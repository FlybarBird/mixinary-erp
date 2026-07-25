import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/pricing";
import type { InvoiceCategoryLine } from "@/lib/projects/invoice-from-bom-labor";

function resolveLogoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public/brand/logo-2.png"),
    path.join(process.cwd(), "public/brand/logo-1.png"),
    path.join(process.cwd(), "public/brand/mark.png"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export async function buildInvoicePdf(params: {
  projectNumber: string;
  projectName: string;
  clientName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  tax: number;
  notes?: string | null;
  lines: InvoiceCategoryLine[];
}): Promise<Buffer> {
  const {
    projectNumber,
    projectName,
    clientName,
    invoiceNumber,
    invoiceDate,
    dueDate,
    status,
    tax,
    notes,
    lines,
  } = params;

  const subtotal = money(lines.reduce((s, l) => s + l.amount, 0));
  const taxAmt = money(Number(tax || 0));
  const total = money(subtotal + taxAmt);

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 48,
    info: {
      Title: `${invoiceNumber} Invoice`,
      Author: "Mixinary ERP",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageWidth = right - left;

  const logoPath = resolveLogoPath();
  const headerTop = doc.y;
  if (logoPath) {
    try {
      doc.image(logoPath, left, headerTop, { fit: [120, 28] });
    } catch {
      /* ignore */
    }
  }

  doc
    .fillColor("#223548")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("INVOICE", right - 160, headerTop, { width: 160, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#556b82")
    .text(invoiceNumber, right - 160, doc.y + 2, {
      width: 160,
      align: "right",
    });

  doc.y = Math.max(doc.y, headerTop + 36);
  doc.moveDown(0.6);

  doc.fillColor("#223548").font("Helvetica-Bold").fontSize(11);
  doc.text(projectName, left, doc.y);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#556b82")
    .text(
      `${projectNumber}${clientName ? ` · ${clientName}` : ""}`,
      left,
      doc.y + 2,
    );

  doc.moveDown(0.8);
  const metaY = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor("#223548");
  doc.text(`Invoice date: ${invoiceDate}`, left, metaY);
  doc.text(`Due date: ${dueDate || "—"}`, left, doc.y + 2);
  doc.text(`Status: ${status}`, left, doc.y + 2);

  doc.moveDown(1.2);

  // Table header
  const colCat = left;
  const colDesc = left + pageWidth * 0.22;
  const colAmt = right - 90;
  const rowH = 16;

  function ensureSpace(h: number) {
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  ensureSpace(30);
  const yHead = doc.y;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#667");
  doc.text("Category", colCat, yHead, { width: pageWidth * 0.2 });
  doc.text("Description", colDesc, yHead, { width: pageWidth * 0.55 });
  doc.text("Amount", colAmt, yHead, { width: 90, align: "right" });
  doc
    .moveTo(left, yHead + 12)
    .lineTo(right, yHead + 12)
    .strokeColor("#d1dbe6")
    .lineWidth(1)
    .stroke();
  doc.y = yHead + 16;

  if (!lines.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#556b82")
      .text("No billable BOM or Labor categories found.", left, doc.y);
  } else {
    for (const line of lines) {
      ensureSpace(rowH + 4);
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor("#223548");
      doc.text(line.category, colCat, y, {
        width: pageWidth * 0.2,
        lineBreak: false,
      });
      doc.text(line.description, colDesc, y, {
        width: pageWidth * 0.52,
      });
      const afterDesc = doc.y;
      doc.text(formatMoney(line.amount), colAmt, y, {
        width: 90,
        align: "right",
        lineBreak: false,
      });
      doc.y = Math.max(afterDesc, y + rowH);
    }
  }

  doc.moveDown(0.8);
  ensureSpace(70);
  doc
    .moveTo(left + pageWidth * 0.55, doc.y)
    .lineTo(right, doc.y)
    .strokeColor("#d1dbe6")
    .stroke();
  doc.moveDown(0.4);

  const totalsX = left + pageWidth * 0.55;
  const labelW = pageWidth * 0.25;
  const valueW = pageWidth * 0.2;

  function totalRow(label: string, value: string, bold = false) {
    const y = doc.y;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 11 : 9)
      .fillColor("#223548")
      .text(label, totalsX, y, { width: labelW, align: "right" });
    doc.text(value, totalsX + labelW, y, { width: valueW, align: "right" });
    doc.moveDown(0.35);
  }

  totalRow("Subtotal", formatMoney(subtotal));
  totalRow("Tax", formatMoney(taxAmt));
  totalRow("Total", formatMoney(total), true);

  if (notes) {
    doc.moveDown(0.8);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#556b82")
      .text("Notes", left);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#223548")
      .text(String(notes), left, doc.y + 2, { width: pageWidth });
  }

  doc.end();

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
