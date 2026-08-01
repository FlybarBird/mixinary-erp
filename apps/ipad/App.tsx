import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/lib/auth-context";
import { LabelsScreen } from "./src/screens/LabelsScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ProjectDetailScreen } from "./src/screens/ProjectDetailScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { colors } from "./src/theme";

type Route =
  | { name: "projects" }
  | { name: "project"; id: string }
  | { name: "labels"; id: string; title: string };

function Root() {
  const { ready, session, profile } = useAuth();
  const [route, setRoute] = useState<Route>({ name: "projects" });
  const [projectTitle, setProjectTitle] = useState("Project");

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

  if (route.name === "labels") {
    return (
      <LabelsScreen
        projectId={route.id}
        projectName={route.title}
        onBack={() => setRoute({ name: "project", id: route.id })}
      />
    );
  }

  if (route.name === "project") {
    return (
      <ProjectDetailScreen
        projectId={route.id}
        onBack={() => setRoute({ name: "projects" })}
        onOpenLabels={() =>
          setRoute({
            name: "labels",
            id: route.id,
            title: projectTitle,
          })
        }
      />
    );
  }

  return (
    <ProjectsScreen
      onOpenProject={(id, title) => {
        setProjectTitle(title || "Project");
        setRoute({ name: "project", id });
      }}
    />
  );
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
