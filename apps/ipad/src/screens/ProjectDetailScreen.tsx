import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchProject, type ProjectDetailResponse } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { colors } from "../theme";

export function ProjectDetailScreen({
  projectId,
  onBack,
  onOpenLabels,
}: {
  projectId: string;
  onBack: () => void;
  onOpenLabels: () => void;
}) {
  const { capabilities } = useAuth();
  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchProject(projectId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load project");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Projects</Text>
        </Pressable>
      </View>

      {!data && !error ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.number}>{data.project.project_number}</Text>
          <Text style={styles.title}>{data.project.name}</Text>
          <Text style={styles.meta}>
            Status: {String(data.project.status).replace("_", " ")}
            {data.project.client_name
              ? ` · ${data.project.client_name}`
              : ""}
          </Text>
          <View style={styles.panel}>
            <Row label="Access" value={data.access_role ?? "—"} />
            <Row label="Can edit" value={data.can_edit ? "Yes" : "No"} />
            <Row
              label="Financials"
              value={data.can_view_financials ? "Visible" : "Hidden"}
            />
            <Row
              label="Default override"
              value={`${Number(data.project.default_override_pct ?? 0) * 100}%`}
            />
          </View>

          {capabilities.receive || capabilities.manageProcurement ? (
            <Pressable style={styles.labelsBtn} onPress={onOpenLabels}>
              <Text style={styles.labelsBtnTitle}>Brother QR labels</Text>
              <Text style={styles.labelsBtnSub}>
                Print receive / item labels on QL Wi‑Fi or Bluetooth
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.note}>
            Next: BOM summary, receive/QR scan, and labor attach to existing
            `/api/projects/[id]/*` routes.
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.ink,
  },
  back: { alignSelf: "flex-start", paddingVertical: 6 },
  backText: { color: "#E8EEF1", fontWeight: "600", fontSize: 16 },
  content: { padding: 24 },
  number: {
    color: colors.accent,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  meta: { color: colors.muted, marginTop: 8, marginBottom: 20, fontSize: 15 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLabel: { color: colors.muted, fontSize: 15 },
  rowValue: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  labelsBtn: {
    marginTop: 16,
    backgroundColor: colors.ink,
    borderRadius: 12,
    padding: 18,
  },
  labelsBtnTitle: { color: "#fff", fontWeight: "700", fontSize: 17 },
  labelsBtnSub: { color: "#B7C5CD", marginTop: 4, fontSize: 13 },
  note: { marginTop: 20, color: colors.muted, lineHeight: 20, fontSize: 14 },
  error: { color: colors.danger, margin: 24 },
});
