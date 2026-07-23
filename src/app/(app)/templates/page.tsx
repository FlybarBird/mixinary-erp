import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TemplatesPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("project_templates")
    .select("id, name, description, default_override_pct")
    .order("name");

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Templates</h1>
        <p className="page-sub">
          Clone rack/hardware packages into new projects from the Projects page.
        </p>
      </div>
      <div className="table-wrap panel-light">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Default %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(templates ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.description}</td>
                <td>{(Number(t.default_override_pct) * 100).toFixed(2)}%</td>
                <td>
                  <Link href={`/projects?template=${t.id}`} style={{ color: "#0176d3" }}>
                    Use in new project
                  </Link>
                </td>
              </tr>
            ))}
            {!templates?.length ? (
              <tr>
                <td colSpan={4}>
                  No templates yet. Import the master workbook from Admin → Excel Import.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
