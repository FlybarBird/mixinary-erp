import { AiSettingsForm } from "@/components/AiSettingsForm";
import { requireProfile } from "@/lib/auth";

export default async function AiSettingsPage() {
  await requireProfile(["administrator"]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">AI settings</h1>
        <p className="page-sub">
          OpenAI API key for parts scrape, MSRP lookup, and PDF quote extraction.
        </p>
      </div>
      <AiSettingsForm />
    </div>
  );
}
