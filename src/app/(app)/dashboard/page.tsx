import Link from "next/link";
import { canViewFinancials, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleProjectIds } from "@/lib/project-access";
import { formatSignedMoney, outOfPocketStyle } from "@/lib/pricing";
import type { ProjectStatus } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  active: "var(--chart-1)",
  complete: "var(--chart-2)",
  on_hold: "var(--chart-3)",
  draft: "var(--chart-5)",
  archived: "var(--chart-4)",
};

function donutBackground(counts: { key: string; value: number }[]) {
  const total = counts.reduce((sum, c) => sum + c.value, 0);
  if (total === 0) {
    return "conic-gradient(var(--line) 0deg 360deg)";
  }
  let cursor = 0;
  const parts: string[] = [];
  for (const item of counts) {
    if (!item.value) continue;
    const start = (cursor / total) * 360;
    cursor += item.value;
    const end = (cursor / total) * 360;
    parts.push(
      `${STATUS_COLORS[item.key] ?? "var(--muted)"} ${start}deg ${end}deg`,
    );
  }
  return `conic-gradient(${parts.join(", ")})`;
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const showFinancials = canViewFinancials(profile.role);
  const accessible = await listAccessibleProjectIds(profile.id, profile.role);

  let recentProjectsQuery = supabase
    .from("projects")
    .select("id, project_number, name, status, clients(name)")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(5);
  let statusQuery = supabase.from("projects").select("status");

  if (accessible !== "all") {
    if (accessible.length === 0) {
      recentProjectsQuery = recentProjectsQuery.eq("id", "__none__");
      statusQuery = statusQuery.eq("id", "__none__");
    } else {
      recentProjectsQuery = recentProjectsQuery.in("id", accessible);
      statusQuery = statusQuery.in("id", accessible);
    }
  }

  const [
    { data: projects },
    { data: allStatuses },
    { data: ordered },
    { data: shipped },
    { data: reviewJobs },
  ] = await Promise.all([
    recentProjectsQuery,
    statusQuery,
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

  let sampleLinesQuery = supabase
    .from("line_items")
    .select("qty, msrp, quote, override_pct, project_id, projects(default_override_pct)")
    .limit(500);
  if (accessible !== "all") {
    if (accessible.length === 0) {
      sampleLinesQuery = sampleLinesQuery.eq("project_id", "__none__");
    } else {
      sampleLinesQuery = sampleLinesQuery.in("project_id", accessible);
    }
  }
  const { data: sampleLines } = await sampleLinesQuery;

  let openOop = 0;
  let openQuote = 0;
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
    openQuote += qty * unitQuote;
    openOop += qty * unitSale - qty * unitQuote;
  }

  const statusOrder: ProjectStatus[] = [
    "active",
    "complete",
    "on_hold",
    "draft",
    "archived",
  ];
  const statusCounts = statusOrder.map((key) => ({
    key,
    value: (allStatuses ?? []).filter((p) => p.status === key).length,
  }));
  const totalProjects = statusCounts.reduce((sum, c) => sum + c.value, 0);
  const archivedCount =
    statusCounts.find((c) => c.key === "archived")?.value ?? 0;
  const activeCount =
    statusCounts.find((c) => c.key === "active")?.value ?? 0;

  const orderedBars = [0.35, 0.55, 0.4, 0.7, 0.5, 0.85, 0.6, 1].map(
    (h, i) => ({ h, key: i }),
  );

  return (
    <div className="stack">
      <section>
        <div className="section-head">
          <h2 className="section-title">Recent projects</h2>
          <Link href="/projects" className="section-link">
            View all
          </Link>
        </div>
        <div className="project-card-grid">
          {(projects ?? []).map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="project-card">
              <div className="project-card-top">
                <span className="project-card-number">{p.project_number}</span>
              </div>
              <div className="project-card-name">{p.name}</div>
              <div className="project-card-meta">
                {(p.clients as { name?: string } | null)?.name ?? "No client"}
              </div>
              <div className="project-card-footer">
                <span className="badge badge-active">active</span>
              </div>
            </Link>
          ))}
        </div>
        {!projects?.length ? (
          <div className="panel" style={{ padding: "1.25rem" }}>
            <p className="muted" style={{ margin: 0 }}>
              No active projects yet.
            </p>
          </div>
        ) : null}
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">
            Insights ({5})
          </h2>
          <Link href="/projects" className="section-link">
            View projects
          </Link>
        </div>
        <div className="insight-grid">
          <article className="insight-card">
            <div className="insight-card-head">
              <div>
                <h3 className="insight-card-title">Active projects</h3>
                <p className="insight-card-sub">Open work</p>
              </div>
            </div>
            <div className="insight-metric">{activeCount}</div>
            <div className="insight-metric-label">Currently active</div>
            <div className="bar-track" aria-hidden>
              {orderedBars.map((b) => (
                <div
                  key={b.key}
                  className="bar-col"
                  style={{ height: `${b.h * 100}%` }}
                />
              ))}
            </div>
          </article>

          <article className="insight-card">
            <div className="insight-card-head">
              <div>
                <h3 className="insight-card-title">Out of pocket</h3>
                <p className="insight-card-sub">Approx. across loaded lines</p>
              </div>
            </div>
            {showFinancials ? (
              <>
                <div
                  className="insight-metric"
                  style={{
                    fontSize: "1.55rem",
                    ...outOfPocketStyle(openOop, openQuote),
                  }}
                >
                  {formatSignedMoney(openOop)}
                </div>
                <div className="insight-metric-label">Sale − quote exposure</div>
              </>
            ) : (
              <>
                <div className="insight-metric" style={{ fontSize: "1.1rem" }}>
                  Restricted
                </div>
                <div className="insight-metric-label">
                  Financials hidden for your role
                </div>
              </>
            )}
          </article>

          <article className="insight-card">
            <div className="insight-card-head">
              <div>
                <h3 className="insight-card-title">Project status</h3>
                <p className="insight-card-sub">
                  {archivedCount} to be archived
                </p>
              </div>
            </div>
            <div className="donut-wrap">
              <div
                className="donut"
                style={{ background: donutBackground(statusCounts) }}
              >
                <div className="donut-hole">
                  <div className="n">{totalProjects}</div>
                  <div className="l">total</div>
                </div>
              </div>
              <div className="donut-legend">
                {statusCounts
                  .filter((c) => c.value > 0)
                  .map((c) => (
                    <span key={c.key}>
                      <i
                        className="swatch"
                        style={{ background: STATUS_COLORS[c.key] }}
                      />
                      {c.key.replace("_", " ")} ({c.value})
                    </span>
                  ))}
              </div>
            </div>
          </article>

          <article className="insight-card">
            <div className="insight-card-head">
              <div>
                <h3 className="insight-card-title">Procurement</h3>
                <p className="insight-card-sub">Ordered vs shipped</p>
              </div>
            </div>
            <div className="row" style={{ gap: "1.5rem", marginTop: "0.5rem" }}>
              <div>
                <div className="insight-metric">{ordered?.length ?? 0}</div>
                <div className="insight-metric-label">Ordered</div>
              </div>
              <div>
                <div className="insight-metric">{shipped?.length ?? 0}</div>
                <div className="insight-metric-label">Shipped</div>
              </div>
            </div>
          </article>

          <article className="insight-card">
            <div className="insight-card-head">
              <div>
                <h3 className="insight-card-title">AI review</h3>
                <p className="insight-card-sub">Needs attention</p>
              </div>
              <Link href="/review" className="section-link">
                Open
              </Link>
            </div>
            <div className="insight-list">
              {(reviewJobs ?? []).slice(0, 4).map((job) => (
                <Link
                  key={job.id}
                  href={`/review/${job.id}`}
                  className="insight-list-row"
                >
                  <span className="badge badge-review">{job.type}</span>
                  <span className="grow">
                    {(job.projects as { project_number?: string } | null)
                      ?.project_number ?? "—"}
                  </span>
                </Link>
              ))}
              {!reviewJobs?.length ? (
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  No AI proposals waiting.
                </p>
              ) : null}
            </div>
          </article>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">
            To-Dos ({(ordered?.length ?? 0) + (reviewJobs?.length ?? 0)})
          </h2>
        </div>
        <div className="insight-grid">
          <article className="insight-card" style={{ minHeight: "auto" }}>
            <div className="insight-card-head">
              <div>
                <h3 className="insight-card-title">In transit</h3>
                <p className="insight-card-sub">Ordered lines</p>
              </div>
            </div>
            <div className="insight-list">
              {(ordered ?? []).slice(0, 5).map((line) => (
                <div key={line.id} className="insight-list-row">
                  <span className="badge badge-ordered">ordered</span>
                  <span className="grow">{line.description}</span>
                </div>
              ))}
              {!ordered?.length ? (
                <p className="muted" style={{ margin: 0 }}>
                  No ordered lines.
                </p>
              ) : null}
            </div>
          </article>

          <article className="insight-card" style={{ minHeight: "auto" }}>
            <div className="insight-card-head">
              <div>
                <h3 className="insight-card-title">Shipped</h3>
                <p className="insight-card-sub">Recent</p>
              </div>
            </div>
            <div className="insight-list">
              {(shipped ?? []).slice(0, 5).map((line) => (
                <div key={line.id} className="insight-list-row">
                  <span className="badge badge-shipped">shipped</span>
                  <span className="grow">{line.description}</span>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    {line.tracking}
                  </span>
                </div>
              ))}
              {!shipped?.length ? (
                <p className="muted" style={{ margin: 0 }}>
                  No shipped lines.
                </p>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
