import { canEditPricing, requireProfile } from "@/lib/auth";
import { TemplateList } from "@/components/TemplateList";
import { createClient } from "@/lib/supabase/server";

export default async function TemplatesPage() {
  const profile = await requireProfile();
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
          Build rack/hardware packages, then clone them into new projects.
        </p>
      </div>
      <TemplateList
        initialTemplates={templates ?? []}
        canEdit={canEditPricing(profile.role)}
      />
    </div>
  );
}
