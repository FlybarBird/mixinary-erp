import { ClientDocumentSettingsForm } from "@/components/ClientDocumentSettingsForm";
import { requireProfile } from "@/lib/auth";
import { getCompanySettings } from "@/lib/company-settings";

export default async function ClientDocumentsAdminPage() {
  await requireProfile(["administrator"]);
  const settings = await getCompanySettings();

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Client Documents</h1>
        <p className="page-sub">
          Add-on toggle, company branding, and defaults for customer-facing
          proposals, quotes, and invoices.
        </p>
      </div>
      <ClientDocumentSettingsForm initialSettings={settings} />
    </div>
  );
}
