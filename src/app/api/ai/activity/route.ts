import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const RECENT_MS = 2 * 60 * 1000;

function jobTitle(type: string, input: unknown): string {
  const data =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (type === "catalog_scrape") {
    const url = typeof data.url === "string" ? data.url : "";
    if (url) {
      try {
        return `Scraping ${new URL(url).hostname.replace(/^www\./, "")}`;
      } catch {
        return "Scraping parts page";
      }
    }
    return "Scraping parts page";
  }
  if (type === "msrp_fetch") return "Fetching MSRP prices";
  if (type === "pdf_quote") return "Reading PDF quote";
  return type.replace(/_/g, " ");
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const [{ data: active }, { data: recent }] = await Promise.all([
    supabase
      .from("ai_jobs")
      .select("id, type, status, input, error, created_at, updated_at, created_by")
      .in("status", ["queued", "running"])
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("ai_jobs")
      .select("id, type, status, input, error, created_at, updated_at, created_by")
      .in("status", ["needs_review", "failed", "applied"])
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const cutoff = Date.now() - RECENT_MS;
  const recentVisible = (recent ?? []).filter((job) => {
    const t = new Date(job.updated_at || job.created_at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  const jobs = [...(active ?? []), ...recentVisible].map((job) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    title: jobTitle(String(job.type), job.input),
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
    href:
      job.status === "needs_review" || job.status === "failed"
        ? `/review/${job.id}`
        : job.type === "catalog_scrape"
          ? "/parts"
          : "/review",
  }));

  // De-dupe by id (shouldn't overlap, but safe)
  const seen = new Set<string>();
  const unique = jobs.filter((j) => {
    if (seen.has(j.id)) return false;
    seen.add(j.id);
    return true;
  });

  return NextResponse.json({
    jobs: unique,
    serverTime: new Date().toISOString(),
  });
}
