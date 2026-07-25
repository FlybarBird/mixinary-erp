"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";
import { cn } from "@/lib/format";
import { canViewFinancials } from "@/lib/permissions";

const primaryLinks = [
  { href: "/dashboard", label: "My Home" },
  { href: "/projects", label: "Project Management" },
  { href: "/reports/portfolio", label: "Portfolio", financial: true },
  { href: "/parts", label: "Parts" },
  { href: "/clients", label: "Clients" },
  { href: "/vendors", label: "Vendors" },
  { href: "/templates", label: "Templates" },
  { href: "/review", label: "AI Review" },
] as const;

function initials(profile: UserProfile) {
  const source = profile.full_name || profile.email || "?";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function AppTopNav({ profile }: { profile: UserProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = profile.role === "administrator";
  const showFinancials = canViewFinancials(profile.role);
  const adminActive = pathname === "/admin" || pathname.startsWith("/admin/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function signOut() {
    if (process.env.NEXT_PUBLIC_MIXINARY_LOCAL_MODE === "true") {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      window.location.assign("/login");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="shell">
      <div className="shell-bar">
        <div className="shell-bar-inner">
          <Link href="/dashboard" className="shell-brand">
            <Image
              src="/brand/mark.png"
              alt="Mixinary"
              width={28}
              height={28}
              priority
            />
            <span className="shell-brand-text">Mixinary ERP</span>
          </Link>

          <div className="shell-actions">
            <div className="shell-user-meta">
              <div className="shell-user-name">
                {profile.full_name || profile.email}
              </div>
              <div className="shell-user-role">{profile.role}</div>
            </div>
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="shell-avatar"
                title="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                {initials(profile)}
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="panel-light"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    minWidth: "10rem",
                    zIndex: 40,
                    padding: "0.35rem",
                    display: "grid",
                    gap: "0.15rem",
                  }}
                >
                  <Link
                    href="/account"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    Account
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="shell-tabs">
        <div className="shell-tabs-inner">
          <nav className="shell-tab-list" aria-label="Primary">
            {primaryLinks
              .filter(
                (link) =>
                  !("financial" in link && link.financial) || showFinancials,
              )
              .map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn("shell-tab", active ? "active" : "")}
                >
                  {link.label}
                </Link>
              );
            })}
            {isAdmin ? (
              <a
                href="/admin"
                className={cn("shell-tab", adminActive ? "active" : "")}
              >
                Admin
              </a>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  );
}
