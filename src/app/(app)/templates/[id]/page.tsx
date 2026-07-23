import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/TemplateEditor";
import { canEditPricing, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("project_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!template) notFound();

  const [{ data: sections }, { data: lines }, { data: vendors }] =
    await Promise.all([
      supabase
        .from("template_sections")
        .select("*")
        .eq("template_id", id)
        .order("sort_order"),
      supabase
        .from("template_line_items")
        .select("*")
        .eq("template_id", id)
        .order("sort_order"),
      supabase.from("vendors").select("*").order("code"),
    ]);

  return (
    <div className="stack">
      <div>
        <p className="muted" style={{ margin: 0 }}>
          <Link href="/templates">Templates</Link> / {template.name}
        </p>
        <h1 className="page-title">{template.name}</h1>
        <p className="page-sub">
          Edit sections and line items for this package template.
        </p>
      </div>
      <TemplateEditor
        initialTemplate={{
          id: template.id,
          name: template.name,
          description: template.description,
          default_override_pct: Number(template.default_override_pct || 0),
        }}
        initialSections={sections ?? []}
        initialLines={lines ?? []}
        vendors={vendors ?? []}
        canEdit={canEditPricing(profile.role)}
      />
    </div>
  );
}
