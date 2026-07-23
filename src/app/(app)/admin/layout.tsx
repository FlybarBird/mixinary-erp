"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const links = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/ai-settings", label: "AI Settings" },
  { href: "/admin/price-sources", label: "Price Sources" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/users", label: "Users" },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="stack">
      <nav className="admin-subnav" aria-label="Admin">
        {links.map((link) => {
          const active =
            "exact" in link && link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn("admin-subnav-link", active ? "active" : "")}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
