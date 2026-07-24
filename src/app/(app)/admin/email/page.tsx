import { requireProfile } from "@/lib/auth";
import { EmailSettingsForm } from "@/components/EmailSettingsForm";

export default async function EmailSettingsPage() {
  await requireProfile(["administrator"]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Email</h1>
        <p className="page-sub">
          Transactional mail for invites and project notifications (Resend or SMTP).
        </p>
      </div>
      <EmailSettingsForm />
    </div>
  );
}
