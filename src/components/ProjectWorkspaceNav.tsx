"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const TABS = [
  { href: "", label: "BOM", match: "bom" },
  { href: "/labor", label: "Labor", match: "labor" },
  { href: "/procurement", label: "Procurement", match: "procurement" },
  { href: "/tracking", label: "Tracking", match: "tracking" },
  { href: "/expenses", label: "Expenses", match: "expenses" },
  { href: "/dashboard", label: "Dashboard", match: "dashboard" },
] as const;

export function ProjectWorkspaceNav({
  projectId,
  canViewFinancials = false,
}: {
  projectId: string;
  canViewFinancials?: boolean;
}) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  function isActive(tab: (typeof TABS)[number]) {
    if (tab.match === "bom") {
      return pathname === base || pathname === `${base}/` || pathname.endsWith("/bom");
    }
    return pathname.startsWith(`${base}${tab.href}`);
  }

  const tabs = TABS.filter(
    (tab) => tab.match !== "dashboard" || canViewFinancials,
  );

  return (
    <nav className="project-workspace-nav" aria-label="Project views">
      {tabs.map((tab) => {
        const active = isActive(tab);
        return (
          <Link
            key={tab.match}
            href={`${base}${tab.href}`}
            className={cn("project-workspace-tab", active ? "active" : "")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
