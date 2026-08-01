import { LabelPrintingSettingsForm } from "@/components/LabelPrintingSettingsForm";
import { requireProfile } from "@/lib/auth";
import { getCompanySettings } from "@/lib/company-settings";

export default async function LabelPrintingAdminPage() {
  await requireProfile(["administrator"]);
  const settings = await getCompanySettings();

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Label printing</h1>
        <p className="page-sub">
          Switch the warehouse QR label printer between DYMO LabelWriter and
          Brother QL.
        </p>
      </div>
      <LabelPrintingSettingsForm initialPrinter={settings.label_printer} />
    </div>
  );
}
