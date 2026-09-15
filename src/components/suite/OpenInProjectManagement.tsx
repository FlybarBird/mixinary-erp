import {
  getPmProgress,
  getProjectMapping,
} from "@/lib/integration/client";
import { projectManagementOpenUrl } from "@/lib/suite/apps";

export async function OpenInProjectManagement({
  erpProjectId,
}: {
  erpProjectId: string;
}) {
  const [mapping, progress] = await Promise.all([
    getProjectMapping(erpProjectId),
    getPmProgress(erpProjectId),
  ]);

  const pmId =
    mapping?.pm_project_identifier ||
    mapping?.pm_project_id ||
    mapping?.huly_project_id;
  const href = projectManagementOpenUrl(pmId);
  const status = mapping?.integration_status ?? "not_linked";
  const linked = Boolean(pmId);
  const summary = (progress as { summary?: { linked?: boolean } } | null)
    ?.summary;

  return (
    <div className="pm-link-bar">
      <a className="btn btn-secondary" href={href}>
        {linked ? "Open in Project Management" : "Project Management"}
      </a>
      <span className="pm-link-status" title="OpenProject sync status">
        {status}
        {summary?.linked ? " · synced" : ""}
      </span>
    </div>
  );
}
