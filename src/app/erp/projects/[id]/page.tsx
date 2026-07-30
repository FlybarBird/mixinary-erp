import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Suite-friendly ERP project deep link used by Plane ERP Resources panel. */
export default async function ErpProjectAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
