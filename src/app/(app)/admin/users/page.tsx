import { requireProfile } from "@/lib/auth";
import { listUserAudit, listUsers } from "@/lib/users";
import { UserManager } from "@/components/UserRoleManager";

export default async function UsersPage() {
  await requireProfile(["administrator"]);
  const [users, audit] = await Promise.all([
    listUsers({ active: "all" }),
    listUserAudit(40),
  ]);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Users</h1>
        <p className="page-sub">
          Create accounts, send invites, set roles, and deactivate users.
        </p>
      </div>
      <UserManager initialUsers={users} initialAudit={audit as never[]} />
    </div>
  );
}
