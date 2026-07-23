import OpenAI from "openai";
import { getLocalDb, isLocalMode } from "@/lib/local/db";

const PLACEHOLDER_KEYS = new Set([
  "",
  "sk-your-openai-key",
  "placeholder-openai",
  "your-openai-key",
]);

function normalizeApiKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let key = String(raw).trim();
  if (!key) return null;
  if (/^bearer\s+/i.test(key)) {
    key = key.replace(/^bearer\s+/i, "").trim();
  }
  // Strip wrapping quotes from .env mistakes
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (PLACEHOLDER_KEYS.has(key.toLowerCase())) return null;
  return key;
}

function getStoredLocalApiKey(): string | null {
  if (!isLocalMode()) return null;
  try {
    const row = getLocalDb()
      .prepare("select value from app_settings where key = ?")
      .get("openai_api_key") as { value: string } | undefined;
    return normalizeApiKey(row?.value);
  } catch {
    return null;
  }
}

export function getOpenAIApiKey(): string | null {
  return normalizeApiKey(process.env.OPENAI_API_KEY) || getStoredLocalApiKey();
}

export function isOpenAIConfigured() {
  return Boolean(getOpenAIApiKey());
}

export function getOpenAI() {
  const key = getOpenAIApiKey();
  if (!key) {
    throw new Error(
      "OpenAI API key is not configured. Add it under Admin → AI Settings (or set OPENAI_API_KEY in .env.local and restart).",
    );
  }
  return new OpenAI({ apiKey: key });
}

export async function extractJson<T>(params: {
  system: string;
  user: string;
  schemaName?: string;
  maxTokens?: number;
}): Promise<T> {
  const openai = getOpenAI();
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: params.maxTokens ?? 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty AI response");
    }
    return JSON.parse(content) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/incorrect api key|invalid_api_key|401/i.test(message)) {
      throw new Error(
        "OpenAI rejected the API key. Check Admin → AI Settings (or OPENAI_API_KEY) and try again.",
      );
    }
    if (/429|rate limit/i.test(message)) {
      throw new Error("OpenAI rate limit hit — wait a moment and retry.");
    }
    throw err instanceof Error ? err : new Error(message);
  }
}
