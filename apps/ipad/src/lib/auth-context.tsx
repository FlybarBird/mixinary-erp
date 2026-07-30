import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserProfile } from "@mixinary/domain";
import { fetchMe } from "./api";
import { isConfigured } from "./config";
import { supabase, type Session } from "./supabase";

type AuthState = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  profile: UserProfile | null;
  capabilities: Record<string, boolean>;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const configured = isConfigured();

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setProfile(null);
      setCapabilities({});
      return;
    }
    const me = await fetchMe();
    setProfile(me.profile);
    setCapabilities(me.capabilities);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        try {
          await refreshProfile();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load profile");
        }
      }
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setCapabilities({});
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured");
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) throw authError;
    await refreshProfile();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setCapabilities({});
  }, []);

  const value = useMemo(
    () => ({
      ready,
      configured,
      session,
      profile,
      capabilities,
      error,
      signIn,
      signOut,
      refreshProfile,
    }),
    [
      ready,
      configured,
      session,
      profile,
      capabilities,
      error,
      signIn,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
