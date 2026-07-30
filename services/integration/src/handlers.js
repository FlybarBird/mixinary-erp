
import { query } from "./db.js";
import { createPlaneProject, addPlaneProjectMembers } from "./plane-client.js";

async function audit(action, entityType, entityId, detail) {
  await query(
    `insert into audit_log (action, entity_type, entity_id, detail) values ($1,$2,$3,$4)`,
    [action, entityType, entityId, detail ?? null],
  );
}

export async function handleProjectCreated(payload) {
  const {
    erpProjectId,
    erpCompanyId,
    erpProjectNumber,
    erpProjectUrl,
    name,
    templateSlug = "mixinary-avl-install",
    members = [],
    workspaceSlug = process.env.PLANE_WORKSPACE_SLUG || "mixinary",
  } = payload;

  const existing = await query(
    `select * from project_map where erp_project_id = $1`,
    [erpProjectId],
  );
  if (existing.rows[0]?.plane_project_id) {
    return { ok: true, duplicate: true, mapping: existing.rows[0] };
  }

  if (!existing.rows[0]) {
    await query(
      `insert into project_map (erp_project_id, erp_company_id, erp_project_number, erp_project_url, integration_status)
       values ($1,$2,$3,$4,'pending')
       on conflict (erp_project_id) do nothing`,
      [erpProjectId, erpCompanyId ?? null, erpProjectNumber ?? null, erpProjectUrl ?? null],
    );
  }

  try {
    const planeProject = await createPlaneProject({ name, templateSlug, workspaceSlug });
    if (members.length) {
      await addPlaneProjectMembers(planeProject.id, members);
    }
    const updated = await query(
      `update project_map
       set plane_project_id = $2,
           plane_workspace_slug = $3,
           integration_status = 'linked',
           last_sync_at = NOW(),
           last_sync_error = null,
           updated_at = NOW()
       where erp_project_id = $1
       returning *`,
      [erpProjectId, String(planeProject.id), workspaceSlug],
    );
    await audit("project.linked", "project", erpProjectId, { planeProjectId: planeProject.id });
    return { ok: true, mapping: updated.rows[0], planeProject };
  } catch (err) {
    await query(
      `update project_map
       set integration_status = 'error', last_sync_error = $2, updated_at = NOW()
       where erp_project_id = $1`,
      [erpProjectId, String(err.message || err)],
    );
    throw err;
  }
}

export async function handleUserProvision(payload) {
  const {
    erpUserId,
    idpSubject,
    verifiedEmail,
    planeRole = "member",
    planeAccessStatus = "enabled",
    planeUserId = null,
  } = payload;

  const res = await query(
    `insert into identity_map (erp_user_id, idp_subject, verified_email, plane_role, plane_access_status, plane_user_id, last_sync_at)
     values ($1,$2,$3,$4,$5,$6,NOW())
     on conflict (erp_user_id) do update set
       idp_subject = excluded.idp_subject,
       verified_email = excluded.verified_email,
       plane_role = excluded.plane_role,
       plane_access_status = excluded.plane_access_status,
       plane_user_id = coalesce(excluded.plane_user_id, identity_map.plane_user_id),
       last_sync_at = NOW(),
       updated_at = NOW()
     returning *`,
    [erpUserId, idpSubject, verifiedEmail, planeRole, planeAccessStatus, planeUserId],
  );
  await audit("user.provisioned", "user", erpUserId, { idpSubject, planeAccessStatus });
  return { ok: true, mapping: res.rows[0] };
}

export async function handleUserDisable(payload) {
  const { erpUserId } = payload;
  const res = await query(
    `update identity_map
     set plane_access_status = 'disabled', last_sync_at = NOW(), updated_at = NOW()
     where erp_user_id = $1
     returning *`,
    [erpUserId],
  );
  await audit("user.disabled", "user", erpUserId, {});
  return { ok: true, mapping: res.rows[0] };
}

export async function handleWorklog(payload) {
  // Forward to ERP labor ingest — no rates.
  const erpBase = (process.env.ERP_BASE_URL || "").replace(/\/$/, "");
  const secret = process.env.WEBHOOK_SIGNING_SECRET || "";
  const body = JSON.stringify({
    erpProjectId: payload.erpProjectId,
    erpUserId: payload.erpUserId,
    planeWorkItemId: payload.planeWorkItemId,
    planeWorklogId: payload.planeWorklogId,
    hours: payload.hours,
    workDate: payload.workDate,
    description: payload.description ?? "",
    approvalStatus: "pending",
  });
  const crypto = await import("./crypto.js");
  const sig = crypto.signPayload(secret, body);
  if (!erpBase || process.env.PLANE_DRY_RUN === "1") {
    await audit("worklog.dry_run", "worklog", payload.planeWorklogId, JSON.parse(body));
    return { ok: true, dryRun: true };
  }
  const res = await fetch(`${erpBase}/api/integration/worklogs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mixinary-signature": sig,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`ERP worklog ingest failed: ${res.status}`);
  }
  await audit("worklog.forwarded", "worklog", payload.planeWorklogId, { erpProjectId: payload.erpProjectId });
  return { ok: true };
}

export async function enqueueEvent(eventType, idempotencyKey, payload) {
  const res = await query(
    `insert into event_outbox (event_type, idempotency_key, payload)
     values ($1,$2,$3)
     on conflict (idempotency_key) do nothing
     returning *`,
    [eventType, idempotencyKey, payload],
  );
  return res.rows[0] ?? { duplicate: true, idempotencyKey };
}

export async function processOutboxBatch(limit = 20) {
  const { rows } = await query(
    `select * from event_outbox
     where status = 'pending' and next_attempt_at <= NOW()
     order by created_at
     limit $1
     for update skip locked`,
    [limit],
  );
  const results = [];
  for (const row of rows) {
    try {
      let result;
      if (row.event_type === "project.created") result = await handleProjectCreated(row.payload);
      else if (row.event_type === "user.provision") result = await handleUserProvision(row.payload);
      else if (row.event_type === "user.disable") result = await handleUserDisable(row.payload);
      else if (row.event_type === "worklog.created") result = await handleWorklog(row.payload);
      else throw new Error(`Unknown event type ${row.event_type}`);

      await query(
        `update event_outbox set status='processed', processed_at=NOW(), last_error=null where id=$1`,
        [row.id],
      );
      results.push({ id: row.id, ok: true, result });
    } catch (err) {
      const attempts = row.attempts + 1;
      const delayMin = Math.min(60, 2 ** Math.min(attempts, 5));
      await query(
        `update event_outbox
         set attempts=$2, last_error=$3, next_attempt_at = NOW() + ($4 || ' minutes')::interval,
             status = case when $2 >= 12 then 'failed' else 'pending' end
         where id=$1`,
        [row.id, attempts, String(err.message || err), String(delayMin)],
      );
      results.push({ id: row.id, ok: false, error: String(err.message || err) });
    }
  }
  return results;
}
