import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/lib/auth-context";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ProjectDetailScreen } from "./src/screens/ProjectDetailScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { colors } from "./src/theme";

function Root() {
  const { ready, session, profile } = useAuth();
  const [projectId, setProjectId] = useState<string | null>(null);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!session || !profile) {
    return <LoginScreen />;
  }

  if (projectId) {
    return (
      <ProjectDetailScreen
        projectId={projectId}
        onBack={() => setProjectId(null)}
      />
    );
  }

  return <ProjectsScreen onOpenProject={setProjectId} />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
