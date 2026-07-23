"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";
import { cn } from "@/lib/format";

const links: Array<{
  href: string;
  label: string;
  roles?: Array<"admin" | "estimator" | "tech">;
}> = [
  { href: "/dashboard", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/clients", label: "Clients" },
  { href: "/vendors", label: "Vendors" },
  { href: "/templates", label: "Templates" },
  { href: "/review", label: "AI Review" },
  { href: "/admin/price-sources", label: "Price Sources", roles: ["admin"] },
  { href: "/admin/import", label: "Import", roles: ["admin"] },
  { href: "/admin/users", label: "Users", roles: ["admin"] },
];

export function AppTopNav({ profile }: { profile: UserProfile }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <Link href="/dashboard" className="top-nav-brand">
          <Image
            src="/brand/mark.png"
            alt="Mixinary"
            width={28}
            height={28}
            priority
          />
          <span className="brand-text">Mixinary ERP</span>
        </Link>

        <nav className="top-nav-links" aria-label="Primary">
          {links
            .filter(
              (link) => !link.roles || link.roles.includes(profile.role),
            )
            .map((link) => {
              const active =
                pathname === link.href ||
                pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn("nav-link", active ? "active" : "")}
                >
                  {link.label}
                </Link>
              );
            })}
        </nav>

        <div className="top-nav-user">
          <div className="user-meta">
            <div className="user-name">
              {profile.full_name || profile.email}
            </div>
            <div className="user-role">{profile.role}</div>
          </div>
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
