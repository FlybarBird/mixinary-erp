import Link from "next/link";
import { requireProfile, canEditPricing } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectForm } from "@/components/CreateProjectForm";
import { ProjectListActions } from "@/components/ProjectListActions";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/format";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await requireProfile();
  const { status: statusFilter } = await searchParams;
  const supabase = await createClient();
  const showArchived = statusFilter === "archived";
  const showAll = statusFilter === "all";

  let projectsQuery = supabase
    .from("projects")
    .select("id, project_number, name, status, default_override_pct, clients(name)")
    .order("project_number", { ascending: false });

  if (showArchived) {
    projectsQuery = projectsQuery.eq("status", "archived");
  } else if (!showAll) {
    projectsQuery = projectsQuery.neq("status", "archived");
  }

  const [{ data: projects }, { data: clients }, { data: templates }] =
    await Promise.all([
      projectsQuery,
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("project_templates").select("id, name").order("name"),
    ]);

  const canEdit = canEditPricing(profile.role);
  const filter = showArchived ? "archived" : showAll ? "all" : "active";

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Project Management</h1>
          <p className="page-sub">
            Project numbers, BOMs, and procurement status.
          </p>
        </div>
        <div className="segmented" role="tablist" aria-label="Project filter">
          <Link
            href="/projects"
            className={cn("btn", filter === "active" ? "btn-active" : "")}
          >
            Active
          </Link>
          <Link
            href="/projects?status=archived"
            className={cn("btn", filter === "archived" ? "btn-active" : "")}
          >
            Archived
          </Link>
          <Link
            href="/projects?status=all"
            className={cn("btn", filter === "all" ? "btn-active" : "")}
          >
            All
          </Link>
        </div>
      </div>

      {canEdit ? (
        <CreateProjectForm
          clients={clients ?? []}
          templates={templates ?? []}
        />
      ) : null}

      <div className="project-card-grid">
        {(projects ?? []).map((p) => {
          const status = p.status as ProjectStatus;
          return (
            <article key={p.id} className="project-card">
              <div className="project-card-top">
                <Link
                  href={`/projects/${p.id}`}
                  className="project-card-number"
                >
                  {p.project_number}
                </Link>
                {canEdit ? (
                  <ProjectListActions
                    projectId={p.id}
                    projectNumber={p.project_number}
                    status={status}
                  />
                ) : null}
              </div>
              <Link href={`/projects/${p.id}`} className="project-card-name">
                {p.name}
              </Link>
              <div className="project-card-meta">
                {(p.clients as { name?: string } | null)?.name ?? "No client"}
              </div>
              <div className="project-card-footer">
                <span className={cn("badge", `badge-${status}`)}>
                  {String(status).replace("_", " ")}
                </span>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Default {(Number(p.default_override_pct) * 100).toFixed(1)}%
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {!projects?.length ? (
        <div className="panel" style={{ padding: "1.25rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            No projects in this view yet.
          </p>
        </div>
      ) : null}
    </div>
  );
}
