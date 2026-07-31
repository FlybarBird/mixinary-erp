import { NextResponse } from "next/server";
import { suiteConfig, suiteOidcEnabled } from "@/lib/suite/config";
import { isLocalMode } from "@/lib/local/db";
import { LOCAL_SESSION_COOKIE } from "@/lib/local/session";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || url.origin;

  if (isLocalMode()) {
    const res = NextResponse.redirect(`${appUrl}/apps`);
    res.cookies.set(LOCAL_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  if (suiteOidcEnabled()) {
    const cfg = suiteConfig();
    if (cfg.endSessionUrl) {
      const end = new URL(cfg.endSessionUrl);
      end.searchParams.set("post_logout_redirect_uri", `${appUrl}/apps`);
      return NextResponse.redirect(end.toString());
    }
  }

  return NextResponse.redirect(`${appUrl}/login`);
}

export async function GET(request: Request) {
  return POST(request);
}
