import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/local/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";

  if (isLocalMode()) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const service = createServiceClient();
      const { data: existing } = await service
        .from("user_profiles")
        .select("id, active")
        .eq("id", user.id)
        .maybeSingle();

      if (existing?.active === false) {
        await supabase.auth.signOut();
        return NextResponse.redirect(
          new URL(
            `/login?error=${encodeURIComponent("This account has been deactivated.")}`,
            url.origin,
          ),
        );
      }

      if (!existing) {
        const meta = user.user_metadata || {};
        await service.from("user_profiles").upsert({
          id: user.id,
          email: user.email,
          full_name: meta.full_name || meta.name || null,
          role: meta.role || "project_manager",
          active: true,
        });
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
