import { redirect } from "next/navigation";
import { SetupForm } from "@/components/SetupForm";
import { needsSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) {
    redirect("/login");
  }

  return <SetupForm />;
}
