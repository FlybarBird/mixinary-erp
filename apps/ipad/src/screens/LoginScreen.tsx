import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../lib/auth-context";
import { config } from "../lib/config";
import { colors } from "../theme";

export function LoginScreen() {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>{config.brandName}</Text>
        <Text style={styles.tagline}>
          Native iPad client connected to your Mixinary cloud ERP.
        </Text>
      </View>

      <View style={styles.card}>
        {!configured ? (
          <Text style={styles.warn}>
            Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and
            EXPO_PUBLIC_API_URL before signing in.
          </Text>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="you@company.com"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          disabled={busy || !configured}
          onPress={() => void onSubmit()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.apiHint}>API: {config.apiUrl}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: "center",
    padding: 28,
  },
  hero: { marginBottom: 28, maxWidth: 520, alignSelf: "center", width: "100%" },
  brand: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1,
  },
  tagline: {
    color: "#B7C5CD",
    marginTop: 10,
    fontSize: 17,
    lineHeight: 24,
    maxWidth: 420,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, marginTop: 12 },
  warn: {
    color: colors.danger,
    marginBottom: 8,
    lineHeight: 20,
  },
  apiHint: {
    marginTop: 16,
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
  },
});
