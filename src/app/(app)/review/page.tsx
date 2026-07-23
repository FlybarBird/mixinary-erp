import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewQueuePage() {
  await requireProfile();
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, type, status, created_at, error, projects(project_number, name)")
    .in("status", ["needs_review", "failed", "running"])
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">AI Review</h1>
        <p className="page-sub">
          MSRP fetches, PDF quotes, and parts scrapes awaiting acceptance.
        </p>
      </div>
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Type</th>
              <th>Project</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).map((job) => (
              <tr key={job.id}>
                <td>{new Date(job.created_at).toLocaleString()}</td>
                <td>
                  {job.type === "catalog_scrape"
                    ? "Parts scrape"
                    : job.type === "msrp_fetch"
                      ? "MSRP fetch"
                      : job.type === "pdf_quote"
                        ? "PDF quote"
                        : job.type}
                </td>
                <td>
                  {(job.projects as { project_number?: string; name?: string } | null)
                    ?.project_number ?? "—"}{" "}
                  {(job.projects as { name?: string } | null)?.name ?? ""}
                </td>
                <td>
                  <span className="badge badge-review">{job.status}</span>
                </td>
                <td>
                  <Link href={`/review/${job.id}`} style={{ color: "#0176d3" }}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!jobs?.length ? (
              <tr>
                <td colSpan={5}>No jobs in queue.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
