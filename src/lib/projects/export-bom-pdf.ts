import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { calculateLinePricing, formatMoney, formatSignedMoney, sumPricing } from "@/lib/pricing";

type Section = { id: string; name: string; sort_order: number };
type Line = {
  id: string;
  section_id: string | null;
  sort_order: number;
  description: string;
  sku: string | null;
  category?: string | null;
  uom?: string | null;
  qty: number;
  msrp: number;
  quote: number | null;
  override_pct: number | null;
  estimated_unit_cost?: number | null;
  vendor_id?: string | null;
  notes?: string | null;
  vendors?: { code?: string; name?: string } | null;
};

function resolveLogoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public/brand/logo-2.png"),
    path.join(process.cwd(), "public/brand/logo-1.png"),
    path.join(process.cwd(), "public/brand/mark.png"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export async function buildBomPdf(params: {
  projectNumber: string;
  projectName: string;
  clientName: string | null;
  defaultOverridePct: number;
  includePricing: boolean;
  sections: Section[];
  lines: Line[];
}): Promise<Buffer> {
  const {
    projectNumber,
    projectName,
    clientName,
    defaultOverridePct,
    includePricing,
    sections,
    lines,
  } = params;

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 40,
    info: {
      Title: `${projectNumber} BOM`,
      Author: "Mixinary ERP",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const left = doc.page.margins.left;
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  function resetCursor(y?: number) {
    doc.x = left;
    if (y != null) doc.y = y;
  }

  // ── Header with logo ──────────────────────────────────────────────
  const logoPath = resolveLogoPath();
  const logoH = 28;
  const logoW = 120;
  const headerTop = doc.y;

  if (logoPath) {
    try {
      doc.image(logoPath, left, headerTop, {
        fit: [logoW, logoH],
      });
    } catch {
      // continue without logo if image fails
    }
  }

  const titleX = logoPath ? left + logoW + 14 : left;
  const titleWidth = pageWidth - (logoPath ? logoW + 14 : 0);

  doc
    .fillColor("#223548")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Bill of Materials", titleX, headerTop, {
      width: titleWidth,
      align: "left",
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`${projectNumber} · ${projectName}`, titleX, headerTop + 16, {
      width: titleWidth,
      align: "left",
      lineBreak: false,
    });

  let metaY = headerTop + 32;
  doc.fontSize(8).fillColor("#556b82");
  if (clientName) {
    doc.text(`Client: ${clientName}`, titleX, metaY, {
      width: titleWidth,
      align: "left",
      lineBreak: false,
    });
    metaY += 11;
  }
  doc.text(
    includePricing
      ? "Pricing included"
      : "Pricing omitted — quantities and descriptions only",
    titleX,
    metaY,
    { width: titleWidth, align: "left", lineBreak: false },
  );
  metaY += 11;
  doc.text(`Generated ${new Date().toLocaleString()}`, titleX, metaY, {
    width: titleWidth,
    align: "left",
    lineBreak: false,
  });

  resetCursor(Math.max(headerTop + logoH, metaY) + 16);
  doc
    .strokeColor("#d1dbe6")
    .moveTo(left, doc.y)
    .lineTo(left + pageWidth, doc.y)
    .stroke();
  resetCursor(doc.y + 12);
  doc.fillColor("#223548");

  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const sortedSections = [...sections].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const unsorted = lines.filter(
    (l) => !l.section_id || !sectionMap.has(l.section_id),
  );

  const groups = [
    ...sortedSections.map((section) => ({
      title: section.name,
      lines: lines
        .filter((l) => l.section_id === section.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    })),
    ...(unsorted.length
      ? [
          {
            title: "General",
            lines: unsorted.sort((a, b) => a.sort_order - b.sort_order),
          },
        ]
      : []),
  ].filter((g) => g.lines.length);

  const priced = lines.map((line) =>
    calculateLinePricing({
      qty: line.qty,
      msrp: line.msrp,
      quote: line.quote,
      overridePct: line.override_pct,
      projectDefaultOverridePct: defaultOverridePct,
    }),
  );
  const totals = sumPricing(priced);

  function ensureSpace(needed: number) {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + needed > bottom) {
      doc.addPage();
      resetCursor(doc.page.margins.top);
    }
  }

  function drawTableHeader() {
    ensureSpace(28);
    const y = doc.y;
    doc.rect(left, y, pageWidth, 18).fill("#edf0f4");
    doc.fillColor("#223548").font("Helvetica-Bold").fontSize(8);
    let x = left + 4;
    const cols: Array<[string, number]> = includePricing
      ? [
          ["Item", 198],
          ["SKU", 70],
          ["Qty", 32],
          ["MSRP", 52],
          ["Quote", 52],
          ["Sale", 52],
          ["Ext Sale", 58],
        ]
      : [
          ["Item", 300],
          ["SKU", 90],
          ["Qty", 40],
          ["Vendor", 90],
        ];
    for (const [label, w] of cols) {
      doc.text(label, x, y + 5, {
        width: w,
        align: "left",
        lineBreak: false,
      });
      x += w;
    }
    resetCursor(y + 22);
    doc.font("Helvetica").fillColor("#223548");
  }

  for (const group of groups) {
    ensureSpace(40);
    // Critical: reset X so section titles stay left-aligned after table cells
    resetCursor();
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#0176d3")
      .text(group.title, left, doc.y, {
        width: pageWidth,
        align: "left",
      });
    resetCursor(doc.y + 4);
    doc.fillColor("#223548");
    drawTableHeader();

    for (const line of group.lines) {
      const pricing = calculateLinePricing({
        qty: line.qty,
        msrp: line.msrp,
        quote: line.quote,
        overridePct: line.override_pct,
        projectDefaultOverridePct: defaultOverridePct,
      });
      const desc = String(line.description || "").slice(0, 80);
      const rowHeight = Math.max(16, Math.ceil(desc.length / 40) * 10);
      ensureSpace(rowHeight + 4);

      const y = doc.y;
      let x = left + 4;
      doc.font("Helvetica").fontSize(8).fillColor("#223548");

      const cells: Array<[string, number, "left" | "right"]> = includePricing
        ? [
            [desc, 198, "left"],
            [line.sku || "—", 70, "left"],
            [String(line.qty ?? 0), 32, "right"],
            [formatMoney(pricing.msrp), 52, "right"],
            [formatMoney(pricing.unitQuote), 52, "right"],
            [formatMoney(pricing.unitSale), 52, "right"],
            [formatMoney(pricing.totalSale), 58, "right"],
          ]
        : [
            [desc, 300, "left"],
            [line.sku || "—", 90, "left"],
            [String(line.qty ?? 0), 40, "right"],
            [line.vendors?.code || line.vendors?.name || "—", 90, "left"],
          ];

      for (const [text, w, align] of cells) {
        doc.text(text, x, y, {
          width: w - 2,
          align,
          lineBreak: false,
          height: rowHeight,
          ellipsis: true,
        });
        x += w;
      }

      // Reset cursor after absolute-positioned cells (prevents next title drifting right)
      resetCursor(y + rowHeight);
      doc
        .strokeColor("#e8eef4")
        .moveTo(left, doc.y)
        .lineTo(left + pageWidth, doc.y)
        .stroke();
      resetCursor(doc.y + 2);
    }
    resetCursor(doc.y + 10);
  }

  if (includePricing) {
    ensureSpace(70);
    resetCursor(doc.y + 6);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#223548")
      .text("Totals", left, doc.y, { width: pageWidth, align: "left" });
    resetCursor(doc.y + 2);
    doc.font("Helvetica").fontSize(9);
    doc.text(`MSRP ${formatMoney(totals.totalMsrp)}`, left, doc.y, {
      width: pageWidth,
      align: "left",
    });
    doc.text(`Quote ${formatMoney(totals.totalQuote)}`, left, doc.y, {
      width: pageWidth,
      align: "left",
    });
    doc.text(`Sale ${formatMoney(totals.totalSale)}`, left, doc.y, {
      width: pageWidth,
      align: "left",
    });
    doc.text(
      `Client savings ${formatMoney(totals.clientSavings)}`,
      left,
      doc.y,
      { width: pageWidth, align: "left" },
    );
    doc
      .font("Helvetica-Bold")
      .text(
        `Out of pocket ${formatSignedMoney(totals.outOfPocket)}`,
        left,
        doc.y,
        { width: pageWidth, align: "left" },
      );
  } else {
    ensureSpace(30);
    resetCursor(doc.y + 4);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#556b82")
      .text(
        `${lines.length} line item(s) · pricing excluded from this export`,
        left,
        doc.y,
        { width: pageWidth, align: "left" },
      );
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  return Buffer.concat(chunks);
}
