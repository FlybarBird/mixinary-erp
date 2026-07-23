"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@/lib/types";
import { OverflowMenu } from "@/components/OverflowMenu";

export function ProjectListActions({
  projectId,
  projectNumber,
  status,
}: {
  projectId: string;
  projectNumber: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onArchive() {
    const archived = status === "archived";
    const label = archived ? "restore" : "archive";
    if (!confirm(`${label[0].toUpperCase()}${label.slice(1)} project ${projectNumber}?`)) {
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: archived ? "active" : "archived" }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to update project");
      return;
    }
    router.refresh();
  }

  async function onDelete() {
    if (
      !confirm(
        `Permanently delete project ${projectNumber}? This removes its BOM, sections, and related data.`,
      )
    ) {
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete project");
      return;
    }
    router.refresh();
  }

  return (
    <OverflowMenu>
      <Link href={`/projects/${projectId}`} className="menu-item" role="menuitem">
        Open
      </Link>
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        disabled={loading}
        onClick={() => void onArchive()}
      >
        {status === "archived" ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        className="menu-item danger"
        role="menuitem"
        disabled={loading}
        onClick={() => void onDelete()}
      >
        Delete
      </button>
    </OverflowMenu>
  );
}
