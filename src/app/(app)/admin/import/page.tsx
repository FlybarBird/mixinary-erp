import { requireProfile } from "@/lib/auth";
import { ExcelImportForm } from "@/components/ExcelImportForm";

export default async function ImportPage() {
  await requireProfile(["administrator"]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Excel import</h1>
        <p className="page-sub">
          Upload the Mixinary master project workbook to seed projects, templates,
          clients, and carriers.
        </p>
      </div>
      <ExcelImportForm />
    </div>
  );
}
