import Link from "next/link";
import { requireProfile, canEditPricing } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectForm } from "@/components/CreateProjectForm";

export default async function ProjectsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: projects }, { data: clients }, { data: templates }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, project_number, name, status, default_override_pct, clients(name)")
        .order("project_number", { ascending: false }),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("project_templates").select("id, name").order("name"),
    ]);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">Project numbers, BOMs, and procurement status.</p>
        </div>
      </div>

      {canEditPricing(profile.role) ? (
        <CreateProjectForm
          clients={clients ?? []}
          templates={templates ?? []}
        />
      ) : null}

      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Client</th>
              <th>Status</th>
              <th>Default %</th>
            </tr>
          </thead>
          <tbody>
            {(projects ?? []).map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/projects/${p.id}`} style={{ color: "#0176d3", fontWeight: 700 }}>
                    {p.project_number}
                  </Link>
                </td>
                <td>{p.name}</td>
                <td>{(p.clients as { name?: string } | null)?.name ?? "—"}</td>
                <td style={{ textTransform: "capitalize" }}>{p.status}</td>
                <td>{(Number(p.default_override_pct) * 100).toFixed(2)}%</td>
              </tr>
            ))}
            {!projects?.length ? (
              <tr>
                <td colSpan={5}>No projects yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
