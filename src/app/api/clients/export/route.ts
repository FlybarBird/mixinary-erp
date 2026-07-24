import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: unknown[]): string {
  return cols.map(esc).join(",");
}

function formatAddress(c: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}): string {
  return [
    c.address_line1,
    c.address_line2,
    [c.city, c.state].filter(Boolean).join(", "),
    c.postal_code,
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const [{ data: clients }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("projects").select("client_id"),
  ]);

  const counts = new Map<string, number>();
  for (const p of projects ?? []) {
    if (!p.client_id) continue;
    counts.set(p.client_id, (counts.get(p.client_id) ?? 0) + 1);
  }

  const headers = [
    "Name",
    "Code",
    "Contact",
    "Email",
    "Phone",
    "Website",
    "Address",
    "Active",
    "Project Count",
    "Notes",
  ];

  const rows = (clients ?? []).map((c) => [
    c.name,
    c.code ?? "",
    c.contact_name ?? "",
    c.email ?? "",
    c.phone ?? "",
    c.website ?? "",
    formatAddress(c),
    c.active === false || c.active === 0 ? "no" : "yes",
    counts.get(c.id) ?? 0,
    c.notes ?? "",
  ]);

  const csv = [row(headers), ...rows.map(row)].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="clients.csv"',
    },
  });
}
