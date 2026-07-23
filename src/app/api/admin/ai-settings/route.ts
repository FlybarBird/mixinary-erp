import { NextResponse } from "next/server";
import { getOpenAIApiKey, isOpenAIConfigured } from "@/lib/ai/openai";
import { canManageAdmin, getCurrentProfile } from "@/lib/auth";
import { getLocalDb, isLocalMode } from "@/lib/local/db";

function maskKey(key: string | null) {
  if (!key) return null;
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = getOpenAIApiKey();
  const fromEnv = Boolean(
    process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY.trim() &&
      !["sk-your-openai-key", "placeholder-openai"].includes(
        process.env.OPENAI_API_KEY.trim(),
      ),
  );

  return NextResponse.json({
    configured: isOpenAIConfigured(),
    source: key ? (fromEnv ? "env" : "settings") : null,
    maskedKey: maskKey(key),
    localMode: isLocalMode(),
  });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManageAdmin(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isLocalMode()) {
    return NextResponse.json(
      {
        error:
          "In cloud mode, set OPENAI_API_KEY in your host environment instead of saving it here.",
      },
      { status: 400 },
    );
  }

  const body = await request.json();
  const action = String(body.action || "save");
  const db = getLocalDb();

  if (action === "clear") {
    db.prepare("delete from app_settings where key = ?").run("openai_api_key");
    return NextResponse.json({ ok: true, configured: isOpenAIConfigured() });
  }

  let key = String(body.openai_api_key || "").trim();
  if (/^bearer\s+/i.test(key)) {
    key = key.replace(/^bearer\s+/i, "").trim();
  }
  if (!key) {
    return NextResponse.json(
      { error: "Paste a valid OpenAI API key (starts with sk-)" },
      { status: 400 },
    );
  }

  db.prepare(
    `insert into app_settings (key, value, updated_at)
     values (?, ?, datetime('now'))
     on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
  ).run("openai_api_key", key);

  // Quick live check against OpenAI
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text();
      let detail = `OpenAI returned ${res.status}`;
      try {
        const parsed = JSON.parse(text) as {
          error?: { message?: string };
        };
        if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        // keep status detail
      }
      return NextResponse.json(
        {
          error: `Key saved, but OpenAI rejected it: ${detail}`,
          configured: true,
          maskedKey: `${key.slice(0, 7)}…${key.slice(-4)}`,
        },
        { status: 400 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `Key saved, but validation request failed: ${message}`,
        configured: true,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    maskedKey: `${key.slice(0, 7)}…${key.slice(-4)}`,
    source: "settings",
  });
}
