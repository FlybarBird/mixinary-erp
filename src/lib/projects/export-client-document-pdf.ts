import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/pricing";
import {
  computePricingTotals,
  normalizePricingContent,
} from "@/lib/client-documents";
import type {
  ClientDocument,
  ClientDocumentBlock,
  ClientDocumentSignature,
  CompanySettings,
} from "@/lib/types";

/** Brand assets that are white/light-on-transparent and unreadable on a white PDF page. */
const LIGHT_BRAND_LOGOS = ["logo-1.png", "logo-4.png"];

function resolveLogoPath(settings: CompanySettings): string | null {
  // PDFs render on a white page, so prefer the dark wordmark over the
  // configured logo, which is typically the light variant used on dark UI.
  const candidates: string[] = [
    path.join(process.cwd(), "public/brand/logo-2.png"),
  ];
  if (
    settings.logo_path &&
    settings.logo_path.startsWith("/") &&
    !LIGHT_BRAND_LOGOS.some((name) => settings.logo_path?.endsWith(name))
  ) {
    candidates.push(path.join(process.cwd(), "public", settings.logo_path));
  }
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function items(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v)).filter(Boolean);
}

export async function buildClientDocumentPdf(params: {
  document: ClientDocument;
  blocks: ClientDocumentBlock[];
  settings: CompanySettings;
  projectNumber: string;
  projectName: string;
  clientName: string | null;
  signatures: ClientDocumentSignature[];
}): Promise<Buffer> {
  const { document, blocks, settings, projectNumber, projectName, clientName, signatures } =
    params;
  const accent = settings.brand_color_primary || "#0070f2";
  const ink = settings.brand_color_accent || "#223548";

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 48,
    info: {
      Title: `${document.doc_number} ${document.name}`,
      Author: settings.legal_name || "Mixinary ERP",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageWidth = right - left;

  function ensureSpace(h: number) {
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  function sectionTitle(title: string) {
    if (!title) return;
    ensureSpace(40);
    doc.moveDown(0.9);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(accent).text(title, left);
    doc.moveDown(0.25);
  }

  function bodyText(body: string) {
    if (!body) return;
    ensureSpace(30);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(ink)
      .text(body, left, doc.y, { width: pageWidth });
  }

  // --- Header / cover -------------------------------------------------------
  const coverBlock = blocks.find(
    (b) => b.block_type === "cover" && !b.hidden,
  );
  doc.rect(0, 0, doc.page.width, 6).fill(accent);
  doc.y = doc.page.margins.top;

  const logoPath = resolveLogoPath(settings);
  const headerTop = doc.y;
  if (logoPath) {
    try {
      doc.image(logoPath, left, headerTop, { fit: [140, 34] });
    } catch {
      /* ignore */
    }
  }
  doc
    .fillColor(ink)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(settings.legal_name || "", left + 160, headerTop, {
      width: pageWidth - 160,
      align: "right",
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#556b82")
    .text(
      [settings.contact_email, settings.contact_phone]
        .filter(Boolean)
        .join(" · "),
      left + 160,
      doc.y + 2,
      { width: pageWidth - 160, align: "right" },
    );

  doc.y = Math.max(doc.y, headerTop + 44);
  doc.moveDown(1);

  const heading = str(coverBlock?.content?.heading) || document.name;
  const subheading =
    str(coverBlock?.content?.subheading) ||
    (clientName ? `Prepared for ${clientName}` : "");
  doc.font("Helvetica-Bold").fontSize(22).fillColor(ink).text(heading, left, doc.y, {
    width: pageWidth,
  });
  if (subheading) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#556b82")
      .text(subheading, left, doc.y + 4, { width: pageWidth });
  }
  doc.moveDown(0.6);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#556b82")
    .text(
      `${document.doc_number} · v${document.version} · ${projectNumber} ${projectName}` +
        (document.expires_at
          ? ` · Valid through ${new Date(document.expires_at).toLocaleDateString("en-US")}`
          : ""),
      left,
      doc.y,
    );
  doc
    .moveTo(left, doc.y + 10)
    .lineTo(right, doc.y + 10)
    .strokeColor("#d1dbe6")
    .lineWidth(1)
    .stroke();
  doc.y += 18;

  // --- Blocks ---------------------------------------------------------------
  for (const block of blocks) {
    if (block.hidden || block.block_type === "cover") continue;
    const content = block.content ?? {};

    switch (block.block_type) {
      case "intro":
      case "text":
      case "project_summary":
      case "terms":
      case "payment_instructions":
      case "contact": {
        const fallbackTitles: Record<string, string> = {
          project_summary: "Project Summary",
          terms: "Terms & Conditions",
          payment_instructions: "Payment Instructions",
          contact: "Contact",
        };
        sectionTitle(
          str(content.title) || fallbackTitles[block.block_type] || "",
        );
        bodyText(str(content.body));
        break;
      }
      case "customer_info": {
        sectionTitle("Customer");
        bodyText([clientName, str(content.note)].filter(Boolean).join("\n"));
        break;
      }
      case "image": {
        const caption = str(content.caption);
        if (caption) {
          doc.moveDown(0.4);
          doc
            .font("Helvetica-Oblique")
            .fontSize(8.5)
            .fillColor("#556b82")
            .text(`[Image] ${caption}`, left);
        }
        break;
      }
      case "scope":
      case "deliverables": {
        sectionTitle(
          str(content.title) ||
            (block.block_type === "scope" ? "Scope of Work" : "Deliverables"),
        );
        for (const item of items(content.items)) {
          ensureSpace(16);
          doc
            .font("Helvetica")
            .fontSize(9.5)
            .fillColor(ink)
            .text(`•  ${item}`, left + 6, doc.y, { width: pageWidth - 12 });
          doc.moveDown(0.15);
        }
        break;
      }
      case "pricing": {
        const pricing = normalizePricingContent(content);
        const totals = computePricingTotals(content);
        sectionTitle(pricing.title || "Pricing");

        const colQty = right - 220;
        const colUnit = right - 160;
        const colTotal = right - 80;
        ensureSpace(30);
        const yHead = doc.y;
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#667");
        doc.text("Item", left, yHead, { width: colQty - left - 8 });
        doc.text("Qty", colQty, yHead, { width: 50, align: "right" });
        doc.text("Unit", colUnit, yHead, { width: 70, align: "right" });
        doc.text("Total", colTotal, yHead, { width: 80, align: "right" });
        doc
          .moveTo(left, yHead + 12)
          .lineTo(right, yHead + 12)
          .strokeColor("#d1dbe6")
          .stroke();
        doc.y = yHead + 16;

        const selected = pricing.lines.filter((l) => l.selected || !l.optional);
        for (const line of selected) {
          ensureSpace(20);
          const y = doc.y;
          doc.font("Helvetica").fontSize(9).fillColor(ink);
          doc.text(
            line.name + (line.optional ? "  (optional)" : ""),
            left,
            y,
            { width: colQty - left - 8 },
          );
          if (line.description) {
            doc
              .font("Helvetica")
              .fontSize(8)
              .fillColor("#556b82")
              .text(line.description, left, doc.y + 1, {
                width: colQty - left - 8,
              });
          }
          const afterName = doc.y;
          doc.font("Helvetica").fontSize(9).fillColor(ink);
          doc.text(String(line.qty), colQty, y, { width: 50, align: "right", lineBreak: false });
          doc.text(formatMoney(line.unit_price), colUnit, y, {
            width: 70,
            align: "right",
            lineBreak: false,
          });
          doc.text(formatMoney(line.qty * line.unit_price), colTotal, y, {
            width: 80,
            align: "right",
            lineBreak: false,
          });
          doc.y = Math.max(afterName, y + 14) + 2;
        }

        const skipped = pricing.lines.filter((l) => l.optional && !l.selected);
        if (skipped.length) {
          doc.moveDown(0.2);
          doc
            .font("Helvetica-Oblique")
            .fontSize(8)
            .fillColor("#556b82")
            .text(
              `Not included: ${skipped.map((l) => l.name).join(", ")}`,
              left,
              doc.y,
              { width: pageWidth },
            );
        }

        doc.moveDown(0.5);
        ensureSpace(70);
        doc
          .moveTo(left + pageWidth * 0.55, doc.y)
          .lineTo(right, doc.y)
          .strokeColor("#d1dbe6")
          .stroke();
        doc.moveDown(0.3);
        const totalsX = left + pageWidth * 0.5;
        const labelW = pageWidth * 0.28;
        const valueW = pageWidth * 0.22;
        function totalRow(label: string, value: string, bold = false) {
          const y = doc.y;
          doc
            .font(bold ? "Helvetica-Bold" : "Helvetica")
            .fontSize(bold ? 11 : 9)
            .fillColor(ink)
            .text(label, totalsX, y, { width: labelW, align: "right" });
          doc.text(value, totalsX + labelW, y, { width: valueW, align: "right" });
          doc.moveDown(0.3);
        }
        totalRow("Subtotal", formatMoney(totals.subtotal));
        if (totals.discount_total > 0) {
          totalRow("Discount", `−${formatMoney(totals.discount_total)}`);
        }
        if (totals.tax_total > 0) {
          totalRow(pricing.tax.label || "Tax", formatMoney(totals.tax_total));
        }
        totalRow("Total", formatMoney(totals.total), true);
        break;
      }
      case "acceptance": {
        sectionTitle(str(content.title) || "Acceptance");
        bodyText(str(content.statement));
        doc.moveDown(0.6);
        if (signatures.length) {
          for (const sig of signatures) {
            ensureSpace(50);
            doc
              .font("Helvetica-Bold")
              .fontSize(13)
              .fillColor(ink)
              .text(sig.signature_text, left);
            doc
              .font("Helvetica")
              .fontSize(8.5)
              .fillColor("#556b82")
              .text(
                `Signed electronically by ${sig.signer_name}` +
                  (sig.signer_email ? ` <${sig.signer_email}>` : "") +
                  ` on ${new Date(sig.signed_at).toLocaleString("en-US")}` +
                  (sig.ip ? ` · IP ${sig.ip}` : ""),
                left,
                doc.y + 2,
              );
            doc.moveDown(0.5);
          }
        } else {
          ensureSpace(60);
          doc.moveDown(1.2);
          doc
            .moveTo(left, doc.y)
            .lineTo(left + pageWidth * 0.45, doc.y)
            .strokeColor(ink)
            .stroke();
          doc
            .font("Helvetica")
            .fontSize(8.5)
            .fillColor("#556b82")
            .text("Signature", left, doc.y + 3);
          doc.moveDown(1.2);
          doc
            .moveTo(left, doc.y)
            .lineTo(left + pageWidth * 0.45, doc.y)
            .strokeColor(ink)
            .stroke();
          doc
            .font("Helvetica")
            .fontSize(8.5)
            .fillColor("#556b82")
            .text("Name / Date", left, doc.y + 3);
        }
        break;
      }
      default:
        break;
    }
  }

  // Footer company line
  doc.moveDown(1.2);
  const footerBits = [
    settings.legal_name,
    settings.address ? settings.address.replace(/\n/g, ", ") : null,
    settings.tax_id ? `Tax ID ${settings.tax_id}` : null,
  ].filter(Boolean);
  if (footerBits.length) {
    ensureSpace(24);
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#8296ab")
      .text(footerBits.join("  ·  "), left, doc.y, { width: pageWidth });
  }

  doc.end();
  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
