import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { LabelMode } from "@mixinary/domain";
import { BROTHER_LABEL } from "@mixinary/domain";
import { apiFetch } from "../lib/api";
import {
  brotherStockSummary,
  downloadLabelPdf,
  printLabelPdf,
  searchBrotherPrinters,
  type BrotherChannel,
} from "../lib/brother-print";
import { colors } from "../theme";

type PoRow = {
  id: string;
  po_number: string;
  status?: string;
  vendors?: { code?: string; name?: string } | null;
};

type LabelsPayload = {
  po_number: string;
  vendor_name: string;
  job_name: string;
  mode: LabelMode;
  truncated: boolean;
  labels: Array<{ key: string; description: string }>;
};

export function LabelsScreen({
  projectId,
  projectName,
  onBack,
}: {
  projectId: string;
  projectName: string;
  onBack: () => void;
}) {
  const [pos, setPos] = useState<PoRow[]>([]);
  const [poId, setPoId] = useState<string | null>(null);
  const [mode, setMode] = useState<LabelMode>("receive");
  const [sheet, setSheet] = useState<LabelsPayload | null>(null);
  const [channels, setChannels] = useState<BrotherChannel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPos, setLoadingPos] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ data?: PoRow[] } | PoRow[]>(
          `/api/projects/${projectId}/purchase-orders`,
        );
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as { data?: PoRow[] }).data)
            ? (data as { data: PoRow[] }).data
            : [];
        if (!cancelled) setPos(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load POs");
        }
      } finally {
        if (!cancelled) setLoadingPos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const loadSheet = useCallback(async (nextPo: string, nextMode: LabelMode) => {
    setError(null);
    setSheet(null);
    try {
      const data = await apiFetch<LabelsPayload>(
        `/api/projects/${projectId}/labels?po=${nextPo}&mode=${nextMode}`,
      );
      setSheet(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load labels");
    }
  }, [projectId]);

  useEffect(() => {
    if (poId) void loadSheet(poId, mode);
  }, [poId, mode, loadSheet]);

  async function onSearchPrinters() {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const result = await searchBrotherPrinters();
      setChannels(result.channels);
      setChannelId(result.channels[0]?.id ?? null);
      setStatus(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Printer search failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPrint() {
    if (!poId) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const { uri, labelCount } = await downloadLabelPdf({
        projectId,
        poId,
        mode,
      });
      const channel = channels.find((c) => c.id === channelId) ?? null;
      const result = await printLabelPdf({ pdfUri: uri, channel });
      setStatus(
        `${result.detail}${labelCount != null ? ` · ${labelCount} labels` : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← {projectName}</Text>
        </Pressable>
        <Text style={styles.title}>Brother labels</Text>
        <Text style={styles.stock}>{brotherStockSummary()}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.section}>Purchase order</Text>
        {loadingPos ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <FlatList
            horizontal
            data={pos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
            ListEmptyComponent={
              <Text style={styles.muted}>No purchase orders on this project.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.chip,
                  poId === item.id && styles.chipActive,
                ]}
                onPress={() => setPoId(item.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    poId === item.id && styles.chipTextActive,
                  ]}
                >
                  {item.po_number}
                </Text>
              </Pressable>
            )}
          />
        )}

        <View style={styles.modeRow}>
          {(["receive", "item"] as LabelMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, mode === m && styles.chipActive]}
              onPress={() => setMode(m)}
            >
              <Text
                style={[styles.chipText, mode === m && styles.chipTextActive]}
              >
                {m === "receive" ? "Receive labels" : "Item labels"}
              </Text>
            </Pressable>
          ))}
        </View>

        {sheet ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>
              {sheet.po_number} · {sheet.labels.length} label
              {sheet.labels.length === 1 ? "" : "s"}
            </Text>
            <Text style={styles.muted}>
              {sheet.mode === "receive" ? sheet.vendor_name : sheet.job_name}
            </Text>
            {sheet.truncated ? (
              <Text style={styles.warn}>Label count capped for this batch.</Text>
            ) : null}
            <Text style={styles.preview} numberOfLines={4}>
              {sheet.labels
                .slice(0, 6)
                .map((l) => l.description)
                .join(" · ") || "No line items"}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={styles.secondaryBtn}
            disabled={busy}
            onPress={() => void onSearchPrinters()}
          >
            <Text style={styles.secondaryBtnText}>Find Brother printers</Text>
          </Pressable>
          {channels.length ? (
            <FlatList
              data={channels}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 120 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.printerRow,
                    channelId === item.id && styles.printerRowActive,
                  ]}
                  onPress={() => setChannelId(item.id)}
                >
                  <Text style={styles.printerName}>
                    {item.modelName || item.id}
                  </Text>
                  <Text style={styles.muted}>
                    {item.ipAddress || item.macAddress || "Brother SDK"}
                  </Text>
                </Pressable>
              )}
            />
          ) : (
            <Text style={styles.hint}>
              Recommended: {BROTHER_LABEL.recommendedModels.join(" or ")} on the
              same Wi‑Fi. Without a native SDK build, Print opens AirPrint —
              pick your Brother QL there.
            </Text>
          )}

          <Pressable
            style={[styles.primaryBtn, (!poId || busy) && styles.disabled]}
            disabled={!poId || busy}
            onPress={() => void onPrint()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                Print on Brother
              </Text>
            )}
          </Pressable>
        </View>

        {status ? <Text style={styles.status}>{status}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.ink,
  },
  back: { alignSelf: "flex-start", paddingVertical: 4 },
  backText: { color: "#E8EEF1", fontWeight: "600", fontSize: 16 },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
    letterSpacing: -0.5,
  },
  stock: { color: "#B7C5CD", marginTop: 4, fontSize: 13 },
  body: { flex: 1, padding: 20 },
  section: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: { color: colors.ink, fontWeight: "600" },
  chipTextActive: { color: colors.accent },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 12 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 16,
  },
  panelTitle: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  preview: { color: colors.muted, marginTop: 8, lineHeight: 18 },
  actions: { gap: 10 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { color: colors.ink, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  printerRow: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginBottom: 6,
  },
  printerRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  printerName: { color: colors.ink, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  muted: { color: colors.muted, fontSize: 13 },
  status: { marginTop: 12, color: colors.statusActive, fontWeight: "600" },
  error: { marginTop: 12, color: colors.danger },
  warn: { color: colors.statusHold, marginTop: 6, fontSize: 13 },
});
