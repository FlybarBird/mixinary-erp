"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReceiveItemSummary } from "@/lib/projects/receive";

type Props = {
  projectId: string;
  initialItemId?: string | null;
  canReceive: boolean;
};

function parseItemIdFromScan(raw: string, projectId: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // Full URL: /projects/{id}/receive?item={itemId}
  try {
    const url = new URL(text, window.location.origin);
    const item = url.searchParams.get("item") || url.searchParams.get("itemId");
    if (item) return item;
    const m = url.pathname.match(/\/receive\/?$/);
    if (m && url.searchParams.get("item")) return url.searchParams.get("item");
  } catch {
    // not a URL
  }

  // Path-only
  const pathMatch = text.match(
    /\/projects\/[^/]+\/receive\?item=([a-zA-Z0-9-]+)/,
  );
  if (pathMatch) return pathMatch[1];

  // Bare UUID / id
  if (/^[a-zA-Z0-9-]{8,}$/.test(text)) return text;

  // Ignore unrelated project mismatch noise
  if (text.includes(projectId) && text.includes("item=")) {
    const m = text.match(/item=([a-zA-Z0-9-]+)/);
    if (m) return m[1];
  }
  return null;
}

export function QrReceiveView({ projectId, initialItemId, canReceive }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const lastScanRef = useRef<string>("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraMode, setCameraMode] = useState<"native" | "html5" | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "ok" | "warn" | "err";
    message: string;
  } | null>(null);
  const [item, setItem] = useState<ReceiveItemSummary | null>(null);
  const [qty, setQty] = useState<number>(0);

  const showToast = useCallback(
    (type: "ok" | "warn" | "err", message: string) => {
      setToast({ type, message });
      window.setTimeout(() => setToast(null), 3500);
    },
    [],
  );

  const loadItem = useCallback(
    async (itemId: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/receive?itemId=${encodeURIComponent(itemId)}`,
          { credentials: "include" },
        );
        const data = await res.json();
        if (!res.ok) {
          showToast("err", data.error || "Item not found");
          setItem(null);
          return;
        }
        const summary = data.data as ReceiveItemSummary;
        setItem(summary);
        setQty(summary.qty_ordered); // default: receive remaining (= full ordered)
        if (summary.remaining <= 0) {
          showToast("warn", "Already fully received");
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId, showToast],
  );

  useEffect(() => {
    if (initialItemId) void loadItem(initialItemId);
  }, [initialItemId, loadItem]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setCameraMode(null);
  }, []);

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  const handleDecoded = useCallback(
    (raw: string) => {
      if (raw === lastScanRef.current) return;
      lastScanRef.current = raw;
      window.setTimeout(() => {
        if (lastScanRef.current === raw) lastScanRef.current = "";
      }, 2500);

      const itemId = parseItemIdFromScan(raw, projectId);
      if (!itemId) {
        showToast("err", "Unrecognized QR code");
        return;
      }
      void loadItem(itemId);
      // Keep URL in sync for share/reload
      router.replace(`/projects/${projectId}/receive?item=${itemId}`, {
        scroll: false,
      });
    },
    [loadItem, projectId, router, showToast],
  );

  async function startCamera() {
    setCameraError(null);
    if (!canReceive) {
      setCameraError("You don’t have permission to receive.");
      return;
    }

    // Prefer BarcodeDetector
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;

    if (Detector) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraMode("native");
        setCameraOn(true);
        const detector = new Detector({ formats: ["qr_code"] });
        let cancelled = false;
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) handleDecoded(codes[0].rawValue);
          } catch {
            // frame miss
          }
          if (!cancelled) requestAnimationFrame(() => void loop());
        };
        scannerRef.current = {
          stop: async () => {
            cancelled = true;
          },
        };
        void loop();
        return;
      } catch (err) {
        setCameraError(
          err instanceof Error ? err.message : "Camera unavailable",
        );
      }
    }

    // Fallback: html5-qrcode
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const id = "qr-receive-reader";
      const el = document.getElementById(id);
      if (!el) {
        setCameraError("Scanner mount missing");
        return;
      }
      const html5 = new Html5Qrcode(id);
      await html5.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => handleDecoded(decoded),
        () => undefined,
      );
      scannerRef.current = {
        stop: async () => {
          await html5.stop();
          html5.clear();
        },
      };
      setCameraMode("html5");
      setCameraOn(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : "Could not start camera. Paste the QR link instead.",
      );
    }
  }

  async function confirmReceive() {
    if (!item || !canReceive || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          itemId: item.id,
          qty_received: qty,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error || "Receive failed");
        return;
      }
      if (data.alreadyComplete) {
        showToast("warn", "Already fully received");
      } else {
        showToast("ok", `Received ${data.data?.description?.slice(0, 40) ?? "item"}`);
      }
      if (data.data) setItem(data.data as ReceiveItemSummary);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const itemId = parseItemIdFromScan(manual, projectId);
    if (!itemId) {
      showToast("err", "Enter a QR link or item id");
      return;
    }
    void loadItem(itemId);
    router.replace(`/projects/${projectId}/receive?item=${itemId}`, {
      scroll: false,
    });
  }

  if (!canReceive) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <p style={{ margin: 0 }}>You don’t have permission to receive items.</p>
        <Link href={`/projects/${projectId}/tracking`} className="btn" style={{ marginTop: "0.75rem" }}>
          Back to Tracking
        </Link>
      </div>
    );
  }

  return (
    <div className="stack qr-receive">
      <div className="row" style={{ justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">QR Receive</h1>
          <p className="page-sub">
            Scan a PO line label or paste the QR link. Confirm to receive remaining qty.
          </p>
        </div>
        <Link className="btn" href={`/projects/${projectId}/procurement`}>
          Procurement
        </Link>
      </div>

      {toast ? (
        <div
          className="panel"
          style={{
            padding: "0.65rem 0.85rem",
            background:
              toast.type === "ok"
                ? "color-mix(in srgb, var(--ok) 12%, #fff)"
                : toast.type === "warn"
                  ? "color-mix(in srgb, var(--warn) 14%, #fff)"
                  : "color-mix(in srgb, var(--danger) 12%, #fff)",
          }}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="panel" style={{ padding: "1rem" }}>
        <div className="row" style={{ gap: "0.5rem", marginBottom: "0.75rem" }}>
          {!cameraOn ? (
            <button type="button" className="btn btn-primary" onClick={() => void startCamera()}>
              Start camera
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => void stopCamera()}>
              Stop camera
            </button>
          )}
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 420,
            margin: "0 auto",
            aspectRatio: "1",
            background: "#111",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: cameraMode === "native" ? "block" : "none",
            }}
          />
          <div
            id="qr-receive-reader"
            style={{
              width: "100%",
              display: cameraMode === "html5" || !cameraOn ? "block" : "none",
            }}
          />
          {!cameraOn ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                opacity: 0.7,
                fontSize: "0.9rem",
                padding: "1rem",
                textAlign: "center",
              }}
            >
              Camera off — start scan or paste a QR link below
            </div>
          ) : null}
        </div>

        {cameraError ? (
          <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{cameraError}</p>
        ) : null}

        <form
          onSubmit={onManualSubmit}
          className="row"
          style={{ gap: "0.5rem", marginTop: "0.85rem", flexWrap: "wrap" }}
        >
          <input
            className="field"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Paste QR URL or item id…"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button type="submit" className="btn" disabled={loading}>
            Look up
          </button>
        </form>
      </div>

      {loading ? <p style={{ color: "var(--muted)" }}>Loading item…</p> : null}

      {item ? (
        <div className="panel" style={{ padding: "1rem" }}>
          <div className="label">Confirm receive</div>
          <h2 style={{ margin: "0.25rem 0 0.75rem", fontSize: "1.15rem" }}>
            {item.description || "Untitled item"}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1rem",
              fontSize: "0.9rem",
            }}
          >
            <div>
              <div className="label">PO</div>
              <div>{item.po_number || "—"}</div>
            </div>
            <div>
              <div className="label">SKU</div>
              <div>{item.sku || "—"}</div>
            </div>
            <div>
              <div className="label">Ordered</div>
              <div>{item.qty_ordered}</div>
            </div>
            <div>
              <div className="label">Already received</div>
              <div>{item.qty_received}</div>
            </div>
            <div>
              <div className="label">Remaining</div>
              <div>{item.remaining}</div>
            </div>
            <div>
              <div className="label">Status</div>
              <div>{item.item_status}</div>
            </div>
          </div>

          <label>
            <div className="label">Qty to set as received</div>
            <input
              type="number"
              className="field"
              style={{ maxWidth: 160 }}
              min={0}
              step="any"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
            <p className="page-sub" style={{ marginTop: "0.35rem" }}>
              Default is full ordered qty (receives remaining). Lower for a partial receive.
            </p>
          </label>

          <div className="row" style={{ gap: "0.5rem", marginTop: "0.85rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                saving || (item.remaining <= 0 && qty === item.qty_received)
              }
              onClick={() => void confirmReceive()}
            >
              {saving ? "Saving…" : "Confirm receive"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setItem(null);
                router.replace(`/projects/${projectId}/receive`, { scroll: false });
              }}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
