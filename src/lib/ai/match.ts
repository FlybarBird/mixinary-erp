function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((t) => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function scoreLineMatch(
  extracted: { sku?: string | null; description?: string | null },
  candidate: { sku?: string | null; description?: string | null },
): number {
  const eSku = extracted.sku?.trim().toLowerCase();
  const cSku = candidate.sku?.trim().toLowerCase();
  if (eSku && cSku && eSku === cSku) return 1;

  const descScore = jaccard(
    tokens(extracted.description ?? ""),
    tokens(candidate.description ?? ""),
  );

  if (eSku && candidate.description) {
    const inDesc = normalize(candidate.description).includes(normalize(eSku));
    if (inDesc) return Math.max(descScore, 0.85);
  }

  return descScore;
}

export function bestMatch<T extends { sku?: string | null; description?: string | null }>(
  extracted: { sku?: string | null; description?: string | null },
  candidates: T[],
  minScore = 0.45,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreLineMatch(extracted, candidate);
    if (!best || score > best.score) best = { item: candidate, score };
  }
  if (!best || best.score < minScore) return null;
  return best;
}
