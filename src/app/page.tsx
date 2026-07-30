import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { needsSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (await needsSetup()) {
    redirect("/setup");
  }
  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
