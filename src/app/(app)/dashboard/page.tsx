import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing";

export default async function DashboardPage() {
  await requireProfile();
  const supabase = await createClient();

  const [
    { data: projects },
    { data: ordered },
    { data: shipped },
    { data: reviewJobs },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, project_number, name, status, clients(name)")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("line_items")
      .select("id, description, tracking, projects(project_number, name)")
      .eq("order_status", "ordered")
      .limit(12),
    supabase
      .from("line_items")
      .select("id, description, tracking, projects(project_number, name)")
      .eq("order_status", "shipped")
      .limit(12),
    supabase
      .from("ai_jobs")
      .select("id, type, status, project_id, created_at, projects(project_number, name)")
      .eq("status", "needs_review")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const { data: sampleLines } = await supabase
    .from("line_items")
    .select("qty, msrp, quote, override_pct, project_id, projects(default_override_pct)")
    .limit(500);

  let openOop = 0;
  for (const line of sampleLines ?? []) {
    const qty = Number(line.qty);
    const msrp = Number(line.msrp);
    const unitQuote = line.quote == null ? msrp : Number(line.quote);
    const override =
      line.override_pct == null
        ? Number(
            (line.projects as { default_override_pct?: number } | null)
              ?.default_override_pct ?? 0,
          )
        : Number(line.override_pct);
    const unitSale = unitQuote + msrp * override;
    openOop += qty * unitSale - qty * unitQuote;
  }

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Open work, shipments, and AI review queue.</p>
      </div>

      <div className="stat-grid">
        <div className="panel stat">
          <div className="k">Active projects</div>
          <div className="v">{projects?.length ?? 0}</div>
        </div>
        <div className="panel stat">
          <div className="k">Lines ordered</div>
          <div className="v">{ordered?.length ?? 0}</div>
        </div>
        <div className="panel stat">
          <div className="k">Lines shipped</div>
          <div className="v">{shipped?.length ?? 0}</div>
        </div>
        <div className="panel stat">
          <div className="k">AI awaiting review</div>
          <div className="v">{reviewJobs?.length ?? 0}</div>
        </div>
      </div>

      <div className="panel" style={{ padding: "1rem" }}>
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          Approx. out-of-pocket across loaded lines
        </div>
        <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>
          {formatMoney(openOop)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "1rem",
        }}
      >
        <section className="panel" style={{ padding: "1rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Active projects</h2>
            <Link href="/projects" className="btn">
              View all
            </Link>
          </div>
          <div className="stack" style={{ marginTop: "0.85rem" }}>
            {(projects ?? []).map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="row">
                <span style={{ fontWeight: 650 }}>{p.project_number}</span>
                <span>{p.name}</span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {(p.clients as { name?: string } | null)?.name}
                </span>
              </Link>
            ))}
            {!projects?.length ? (
              <p className="muted">No active projects yet. Import the master workbook or create one.</p>
            ) : null}
          </div>
        </section>

        <section className="panel" style={{ padding: "1rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>AI review queue</h2>
            <Link href="/review" className="btn">
              Open
            </Link>
          </div>
          <div className="stack" style={{ marginTop: "0.85rem" }}>
            {(reviewJobs ?? []).map((job) => (
              <Link key={job.id} href={`/review/${job.id}`} className="row">
                <span className="badge badge-review">{job.type}</span>
                <span>
                  {(job.projects as { project_number?: string } | null)
                    ?.project_number ?? "—"}
                </span>
                <span className="muted" style={{ marginLeft: "auto", fontSize: "0.8rem" }}>
                  {new Date(job.created_at).toLocaleString()}
                </span>
              </Link>
            ))}
            {!reviewJobs?.length ? (
              <p className="muted">No AI proposals waiting.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
        }}
      >
        <section className="panel" style={{ padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.05rem" }}>
            Awaiting order / in transit
          </h2>
          <div className="stack">
            {(ordered ?? []).map((line) => (
              <div key={line.id} className="row">
                <span className="badge badge-ordered">ordered</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {line.description}
                </span>
              </div>
            ))}
            {!ordered?.length ? <p className="muted">No ordered lines.</p> : null}
          </div>
        </section>
        <section className="panel" style={{ padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.05rem" }}>Shipped</h2>
          <div className="stack">
            {(shipped ?? []).map((line) => (
              <div key={line.id} className="row">
                <span className="badge badge-shipped">shipped</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {line.description}
                </span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {line.tracking}
                </span>
              </div>
            ))}
            {!shipped?.length ? <p className="muted">No shipped lines.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
