import {
  getPlaneProgress,
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
    getPlaneProgress(erpProjectId),
  ]);

  const href = projectManagementOpenUrl(mapping?.plane_project_id);
  const status = mapping?.integration_status ?? "not_linked";
  const linked = Boolean(mapping?.plane_project_id);
  const summary = (progress as { summary?: { linked?: boolean } } | null)
    ?.summary;

  return (
    <div className="pm-link-bar">
      <a className="btn btn-secondary" href={href}>
        {linked ? "Open in Project Management" : "Project Management"}
      </a>
      <span className="pm-link-status" title="Plane sync status">
        {status}
        {summary?.linked ? " · synced" : ""}
      </span>
    </div>
  );
}
