import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCompanySettings } from "@/lib/company-settings";

export const dynamic = "force-dynamic";

export default async function ClientDocumentsSuitePage() {
  await requireProfile();
  const supabase = await createClient();
  const settings = await getCompanySettings(supabase);

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_number, name, status")
    .eq("status", "active")
    .order("project_number", { ascending: false })
    .limit(50);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Client Documents</h1>
        <p className="page-sub">
          Suite entry for proposals and invoice-ready client documents. Open a
          project to manage its documents.
        </p>
      </div>
      {!settings.client_documents_enabled ? (
        <p className="page-sub">
          Client Documents add-on is disabled. Enable it in{" "}
          <Link href="/admin/client-documents">Admin → Client Documents</Link>.
        </p>
      ) : null}
      <div className="panel-light" style={{ padding: "1rem" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Name</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(projects ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.project_number}</td>
                <td>{p.name}</td>
                <td>
                  <Link href={`/projects/${p.id}/documents`}>Documents</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
