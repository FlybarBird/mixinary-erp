import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ProjectListItem } from "@mixinary/domain";
import { USER_ROLE_LABELS } from "@mixinary/domain";
import { fetchProjects } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { config } from "../lib/config";
import { colors } from "../theme";

function statusColor(status: string) {
  switch (status) {
    case "active":
      return colors.statusActive;
    case "on_hold":
      return colors.statusHold;
    case "draft":
      return colors.statusDraft;
    case "complete":
      return colors.statusComplete;
    case "archived":
      return colors.statusArchived;
    default:
      return colors.muted;
  }
}

export function ProjectsScreen({
  onOpenProject,
}: {
  onOpenProject: (id: string, title: string) => void;
}) {
  const { profile, signOut, capabilities } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProjects("active");
      setProjects(data.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>{config.brandName}</Text>
          <Text style={styles.sub}>
            {profile?.full_name || profile?.email}
            {profile ? ` · ${USER_ROLE_LABELS[profile.role]}` : ""}
          </Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {capabilities.receive ? (
        <Text style={styles.hint}>
          Brother QL label printing is available from each project. Receiving /
          denser editors land in later phases.
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ?? "No active projects for your account."}
            </Text>
          }
          ListHeaderComponent={
            error ? <Text style={styles.error}>{error}</Text> : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                onOpenProject(
                  item.id,
                  `${item.project_number} · ${item.name}`,
                )
              }
            >
              <View style={styles.cardTop}>
                <Text style={styles.number}>{item.project_number}</Text>
                <Text
                  style={[styles.badge, { color: statusColor(item.status) }]}
                >
                  {item.status.replace("_", " ")}
                </Text>
              </View>
              <Text style={styles.name}>{item.name}</Text>
              {item.client_name ? (
                <Text style={styles.client}>{item.client_name}</Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: colors.ink,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brand: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  sub: { color: "#B7C5CD", marginTop: 4, fontSize: 14 },
  signOut: {
    borderWidth: 1,
    borderColor: "#3A5160",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  signOutText: { color: "#E8EEF1", fontWeight: "600" },
  hint: {
    marginHorizontal: 24,
    marginTop: 12,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  list: { padding: 24, gap: 12, paddingBottom: 48 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  number: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.4,
  },
  badge: { fontWeight: "700", fontSize: 12, textTransform: "capitalize" },
  name: { color: colors.ink, fontSize: 20, fontWeight: "600" },
  client: { color: colors.muted, marginTop: 4, fontSize: 14 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40 },
  error: { color: colors.danger, marginBottom: 12 },
});
