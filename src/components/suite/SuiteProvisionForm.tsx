"use client";

import { useState } from "react";

export function SuiteProvisionForm() {
  const [userId, setUserId] = useState("");
  const [planeRole, setPlaneRole] = useState("member");
  const [message, setMessage] = useState("");

  async function run(action: "enable" | "disable") {
    setMessage("Working…");
    const res = await fetch("/api/integration/provision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, action, planeRole }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error || "Failed");
      return;
    }
    setMessage(`OK: ${action} for ${userId}`);
  }

  return (
    <div className="stack" style={{ gap: "0.75rem", maxWidth: "28rem" }}>
      <label className="field">
        <span>ERP user id</span>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="user UUID"
        />
      </label>
      <label className="field">
        <span>Plane role</span>
        <select
          value={planeRole}
          onChange={(e) => setPlaneRole(e.target.value)}
        >
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="guest">guest</option>
        </select>
      </label>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="btn" onClick={() => void run("enable")}>
          Provision PM access
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void run("disable")}
        >
          Disable PM access
        </button>
      </div>
      {message ? <p className="page-sub">{message}</p> : null}
    </div>
  );
}
