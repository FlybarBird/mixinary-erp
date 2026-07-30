/**
 * Build DYMO Label XML for 3.1" × 1.8" (3-1/10" × 1-4/5") stock.
 * Units are twips (1" = 1440 twips) → 4464 × 2592.
 */

const LABEL_W = 4464;
const LABEL_H = 2592;

export type ReceiveLabelData = {
  mode: "receive";
  poNumber: string;
  vendorName: string;
  description: string;
  sku: string | null;
  qtyOrdered: number;
  qrDataUrl: string;
};

export type ItemLabelData = {
  mode: "item";
  poNumber: string;
  jobName: string;
  description: string;
  sku: string | null;
  pieceIndex: number;
  pieceTotal: number;
  qrDataUrl: string;
};

export type DymoLabelData = ReceiveLabelData | ItemLabelData;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pngBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf("base64,");
  return idx >= 0 ? dataUrl.slice(idx + "base64,".length) : dataUrl;
}

function textBlock(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fontSize: number,
  bold = false,
): string {
  return `
  <ObjectInfo>
    <TextObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(text)}</String>
          <Attributes>
            <Font Family="Arial" Size="${fontSize}" Bold="${bold ? "True" : "False"}" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${x}" Y="${y}" Width="${w}" Height="${h}" />
  </ObjectInfo>`;
}

function imageBlock(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  dataUrl: string,
): string {
  return `
  <ObjectInfo>
    <ImageObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <ImageLocation>RemoteFile</ImageLocation>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Center</VerticalAlignment>
      <ImageData>${pngBase64(dataUrl)}</ImageData>
    </ImageObject>
    <Bounds X="${x}" Y="${y}" Width="${w}" Height="${h}" />
  </ObjectInfo>`;
}

/** Landscape label for 3.1" × 1.8" DYMO stock. */
export function buildDymoLabelXml(data: DymoLabelData): string {
  const margin = 90;
  const qrSize = 1400;
  const qrX = LABEL_W - margin - qrSize;
  const qrY = Math.round((LABEL_H - qrSize) / 2);
  const textX = margin;
  const textW = qrX - margin - 80;

  let blocks = "";
  if (data.mode === "receive") {
    blocks =
      textBlock("PO", textX, 120, textW, 320, data.poNumber, 14, true) +
      textBlock("Vendor", textX, 420, textW, 260, data.vendorName, 9, false) +
      textBlock("Desc", textX, 700, textW, 520, data.description, 11, true) +
      textBlock(
        "SkuQty",
        textX,
        1280,
        textW,
        280,
        `SKU ${data.sku || "—"}  ·  Qty ${data.qtyOrdered}`,
        9,
        false,
      ) +
      textBlock("Kind", textX, 1680, textW, 220, "RECEIVE", 8, true);
  } else {
    blocks =
      textBlock("PO", textX, 100, textW, 280, data.poNumber, 13, true) +
      textBlock("Job", textX, 380, textW, 280, data.jobName, 10, false) +
      textBlock("Desc", textX, 680, textW, 520, data.description, 11, true) +
      textBlock(
        "Sku",
        textX,
        1240,
        textW,
        240,
        `SKU ${data.sku || "—"}`,
        9,
        false,
      ) +
      textBlock(
        "Piece",
        textX,
        1520,
        textW,
        360,
        `(${data.pieceIndex}/${data.pieceTotal})`,
        16,
        true,
      );
  }

  blocks += imageBlock("QR", qrX, qrY, qrSize, qrSize, data.qrDataUrl);

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>MixinaryQr1831</Id>
  <PaperName>Custom</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${LABEL_W}" Height="${LABEL_H}" Rx="0" Ry="0" />
  </DrawCommands>
  ${blocks}
</DieCutLabel>`;
}
