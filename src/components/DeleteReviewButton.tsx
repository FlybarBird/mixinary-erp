"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteReviewButton({
  jobId,
  label = "Delete",
  redirectTo,
}: {
  jobId: string;
  label?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    const ok = window.confirm("Delete this AI review? This cannot be undone.");
    if (!ok) return;
    setPending(true);
    const res = await fetch(`/api/ai/jobs?id=${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      window.alert(data.error || "Could not delete review");
      return;
    }
    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      className="btn btn-danger"
      disabled={pending}
      onClick={() => void remove()}
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
