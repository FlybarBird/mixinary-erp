"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const localMode = process.env.NEXT_PUBLIC_MIXINARY_LOCAL_MODE === "true";

const POSTER = "/brand/mixinary-av-city-poster.png";
const VIDEO_WEBM = "/brand/mixinary-av-city-loop.webm";
const VIDEO_MP4 = "/brand/mixinary-av-city-loop.mp4";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function LoginForm({ tagline }: { tagline: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const fromQuery = params.get("error");
    if (fromQuery) setError(fromQuery);
  }, [params]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    const play = el.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        /* Autoplay blocked — poster remains visible */
      });
    }
  }, [reduceMotion]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (localMode) {
      if (mode === "magic") {
        setLoading(false);
        setError(
          "Magic link requires Resend or SMTP. Use password sign-in, or configure mail in Admin → Email.",
        );
        return;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoading(false);
        setError(data.error || "Login failed");
        return;
      }
      window.location.assign(params.get("next") || "/dashboard");
      return;
    }

    const supabase = createClient();

    if (mode === "magic") {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${appUrl()}/auth/callback` },
      });
      setLoading(false);
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setInfo("Check your email for a magic link to sign in.");
      return;
    }

    const check = await fetch("/api/auth/login", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const checkData = await check.json();
    if (!check.ok) {
      setLoading(false);
      setError(checkData.error || "Login blocked");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push(params.get("next") || "/dashboard");
    router.refresh();
  }

  async function onForgotPassword() {
    if (localMode) {
      setError("Ask an administrator to reset your password in Admin → Users.");
      return;
    }
    if (!email.includes("@")) {
      setError("Enter your email above, then click Forgot password.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${appUrl()}/auth/reset` },
    );
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setInfo("Password reset email sent if that account exists.");
  }

  async function onOAuth(provider: "google" | "azure") {
    if (localMode) {
      setError("SSO is available when connected to Supabase.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${appUrl()}/auth/callback` },
    });
    if (oauthError) {
      setLoading(false);
      setError(oauthError.message);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-media" aria-hidden>
        {!reduceMotion ? (
          <video
            ref={videoRef}
            className="login-video"
            autoPlay
            muted
            loop
            playsInline
            poster={POSTER}
            preload="metadata"
          >
            <source src={VIDEO_WEBM} type="video/webm" />
            <source src={VIDEO_MP4} type="video/mp4" />
          </video>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="login-video" src={POSTER} alt="" />
        )}
        <div className="login-scrim" />
      </div>

      <div className="login-panel">
        <div className="login-card stack">
          <Image
            src="/brand/logo-1.png"
            alt="Mixinary — High Quality Production"
            width={260}
            height={64}
            priority
            className="login-logo"
          />
          <div>
            <h1 className="page-title login-title">Sign in</h1>
            <p className="page-sub login-tagline">{tagline}</p>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="field"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode === "password" ? (
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="field"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            ) : null}
            {error ? (
              <p className="login-error" style={{ margin: 0 }}>
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="login-info" style={{ margin: 0 }}>
                {info}
              </p>
            ) : null}
            <button
              className="btn btn-primary login-primary"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Please wait…"
                : mode === "magic"
                  ? "Send magic link"
                  : "Sign in"}
            </button>
          </form>

          <div className="stack-tight">
            <button
              type="button"
              className="btn login-secondary"
              disabled={loading}
              onClick={() =>
                setMode((m) => (m === "password" ? "magic" : "password"))
              }
            >
              {mode === "password"
                ? "Continue with email link"
                : "Use password instead"}
            </button>
            {mode === "password" ? (
              <button
                type="button"
                className="btn login-secondary"
                disabled={loading}
                onClick={() => void onForgotPassword()}
              >
                Forgot password
              </button>
            ) : null}
            {!localMode ? (
              <>
                <button
                  type="button"
                  className="btn login-secondary"
                  disabled={loading}
                  onClick={() => void onOAuth("google")}
                >
                  Continue with Google
                </button>
                <button
                  type="button"
                  className="btn login-secondary"
                  disabled={loading}
                  onClick={() => void onOAuth("azure")}
                >
                  Continue with Microsoft
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
