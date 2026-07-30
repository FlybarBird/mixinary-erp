/**
 * Runtime config for the Mixinary iPad client.
 *
 * Set via Expo env (app.config / .env) or edit defaults for local dev:
 * - EXPO_PUBLIC_API_URL — Next.js ERP origin (e.g. https://erp.example.com)
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_ANON_KEY
 */
const extra = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export const config = {
  apiUrl: extra.apiUrl.replace(/\/$/, ""),
  supabaseUrl: extra.supabaseUrl,
  supabaseAnonKey: extra.supabaseAnonKey,
  brandName: "Mixinary ERP",
};

export function isConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.apiUrl);
}
