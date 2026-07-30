import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Suite alias for the ERP home. */
export default function ErpAliasPage() {
  redirect("/dashboard");
}
