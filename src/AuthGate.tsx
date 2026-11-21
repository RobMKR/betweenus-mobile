import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { supabase, sessionStorage, SESSION_KEY } from "./auth";
import { requestEmailCode, verifyEmailCode } from "./auth-flow";
export default function AuthGate({
  children,
  onExit,
}: {
  onExit?: () => void;
  children: (
    token: string,
    signOut: () => Promise<void>,
    identity: string,
  ) => React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const signingOut = useRef(false);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let authEventReceived = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true;
      if (active && !signingOut.current) {
        setSession(next);
        setLoading(false);
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !authEventReceived && !signingOut.current) {
          if (error) setError(error.message);
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    const update = (state: string | null | undefined) => {
      if (state === "active" && !signingOut.current)
        supabase!.auth.startAutoRefresh();
      else supabase!.auth.stopAutoRefresh();
    };
    update(AppState.currentState);
    const listener = AppState.addEventListener("change", update);
    return () => {
      active = false;
      generation.current++;
      subscription.unsubscribe();
      listener.remove();
      supabase!.auth.stopAutoRefresh();
    };
  }, []);
  async function signOut() {
    generation.current++;
    setSession(null);
    setEmail("");
    setCode("");
    setSent(false);
    setError("");
    signingOut.current = true;
    supabase!.auth.stopAutoRefresh();
    setBusy(true);
    try {
      const { error } = await supabase!.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (e) {
      setError(
        `You are signed out on this screen. Session cleanup reported: ${(e as Error).message}`,
      );
    } finally {
      try {
        await sessionStorage.removeItem(SESSION_KEY);
        await sessionStorage.removeItem(`${SESSION_KEY}-code-verifier`);
      } catch {
        setError(
          "Session storage could not be cleared. Clear app storage or browser site data before sharing this device.",
        );
      }
      setBusy(false);
    }
  }

  async function submit(verify: boolean) {
    setBusy(true);
    setError("");
    const current = generation.current;
    try {
      if (verify) {
        await verifyEmailCode(supabase!.auth, email, code);
        const { data, error } = await supabase!.auth.getSession();
        if (error) throw error;
        if (current === generation.current && data.session) {
          signingOut.current = false;
          setSession(data.session);
          supabase!.auth.startAutoRefresh();
        }
      } else {
        await requestEmailCode(supabase!.auth, email);
        if (current === generation.current) setSent(true);
      }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  if (!loading && session)
    return <>{children(session.access_token, signOut, session.user.id)}</>;
  return (
    <SafeAreaView style={styles.page}>
      {onExit && (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to mode selection"
            onPress={onExit}
            style={styles.returnButton}
          >
            <Text style={styles.returnText}>‹ Mode selection</Text>
          </Pressable>
        </View>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading account"
              color="#176b50"
            />
          ) : (
            <View style={styles.card}>
              <Text style={styles.brand}>BetweenUs</Text>
              <Text style={styles.title}>
                {supabase
                  ? "A little clarity starts here."
                  : "Sign-in needs configuration"}
              </Text>
              <Text style={styles.text}>
                {supabase
                  ? "Sign in with a code sent to your email. No password to remember."
                  : "Set the public Supabase project URL and publishable key, then rebuild the app. Account sign-in is unavailable until this project is connected."}
              </Text>
              {supabase && (
                <>
                  <TextInput
                    accessibilityLabel="Email address"
                    style={styles.input}
                    value={email}
                    editable={!sent && !busy}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="you@example.com"
                  />
                  {sent && (
                    <>
                      <Text style={styles.text}>
                        Check your email for a numeric code. Delivery may take a
                        moment.
                      </Text>
                      <TextInput
                        accessibilityLabel="Email code"
                        style={styles.input}
                        value={code}
                        onChangeText={setCode}
                        keyboardType="number-pad"
                        autoComplete="one-time-code"
                        placeholder="Email code"
                        maxLength={10}
                      />
                    </>
                  )}
                  <Pressable
                    disabled={busy}
                    style={styles.button}
                    onPress={() => void submit(sent)}
                  >
                    <Text style={styles.buttonText}>
                      {busy
                        ? "Please wait…"
                        : sent
                          ? "Verify & sign in"
                          : "Email me a code"}
                    </Text>
                  </Pressable>
                  {sent && (
                    <>
                      <Pressable
                        disabled={busy}
                        onPress={() => void submit(false)}
                      >
                        <Text style={styles.link}>Resend code</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => {
                          generation.current++;
                          setSent(false);
                          setCode("");
                          setError("");
                        }}
                      >
                        <Text style={styles.link}>Use another email</Text>
                      </Pressable>
                    </>
                  )}
                </>
              )}
              {!!error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}
              <Text style={styles.text}>A shared record, built on trust.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f7f8f3",
  },
  header: { paddingHorizontal: 12, paddingVertical: 4 },
  returnButton: {
    minHeight: 44,
    minWidth: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  returnText: {
    color: "#176b50",
    fontSize: 14,
    lineHeight: 24,
    fontWeight: "600",
  },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 440, alignSelf: "center", gap: 20 },
  brand: { fontSize: 25, fontWeight: "700", color: "#203b35" },
  title: {
    fontSize: 35,
    fontWeight: "600",
    color: "#203b35",
    letterSpacing: -1,
  },
  text: { fontSize: 14, lineHeight: 22, color: "#71817a" },
  input: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#d5ded3",
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: "white",
  },
  button: {
    backgroundColor: "#176b50",
    padding: 17,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600" },
  link: { color: "#176b50", textAlign: "center", padding: 4 },
  error: { color: "#a33131", lineHeight: 22 },
});
