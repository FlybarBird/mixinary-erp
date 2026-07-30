import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (await needsSetup()) {
    redirect("/setup");
  }
  // Suite landing is the shared entry point.
  redirect("/apps");
}
