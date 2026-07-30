import { createClient } from "@/lib/supabase/server";
import { isLocalMode, getLocalDb, newId } from "@/lib/local/db";
import { publishIntegrationEvent } from "@/lib/integration/client";

export async function enqueueErpOutbox(input: {
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  if (isLocalMode()) {
    const db = getLocalDb();
    db.prepare(
      `insert or ignore into integration_outbox (id, event_type, idempotency_key, payload, status)
       values (?, ?, ?, ?, 'pending')`,
    ).run(
      newId(),
      input.eventType,
      input.idempotencyKey,
      JSON.stringify(input.payload),
    );
  } else {
    const supabase = await createClient();
    await supabase.from("integration_outbox").upsert(
      {
        event_type: input.eventType,
        idempotency_key: input.idempotencyKey,
        payload: input.payload,
        status: "pending",
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );
  }

  // Best-effort immediate publish (failure must not throw to callers).
  const result = await publishIntegrationEvent({
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    data: input.payload,
  });

  if (result && "ok" in result && result.ok) {
    await markOutboxProcessed(input.idempotencyKey);
  }

  return result;
}

async function markOutboxProcessed(idempotencyKey: string) {
  if (isLocalMode()) {
    getLocalDb()
      .prepare(
        `update integration_outbox set status='processed', processed_at=datetime('now')
         where idempotency_key=?`,
      )
      .run(idempotencyKey);
    return;
  }
  const supabase = await createClient();
  await supabase
    .from("integration_outbox")
    .update({ status: "processed", processed_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey);
}
