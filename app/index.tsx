import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEMO } from "../src/api";
import OfflineHome from "../src/offline/OfflineHome";
import BrandMark from "../src/BrandMark";
import { Button, useUi } from "../src/offline/ui";
// Account code (and Supabase session restoration) is loaded only by explicit choice.
const SharedHome = lazy(() => import("../src/SharedHome"));
const MODE_KEY = "betweenus.mode.v1";
export default function Home() {
  const { c, s } = useUi();
  const [mode, setMode] = useState<"offline" | "account" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(MODE_KEY)
      .then((value) => {
        if (active && (value === "offline" || value === "account"))
          setMode(value);
        else if (active && DEMO) setMode("account");
      })
      .catch(() => {
        if (active)
          setError(
            "The last mode could not be restored. You can still choose a mode below.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function choose(next: "offline" | "account" | null) {
    setError("");
    try {
      if (next) await AsyncStorage.setItem(MODE_KEY, next);
      else await AsyncStorage.removeItem(MODE_KEY);
    } catch {
      setError(
        "Mode preference could not be saved. Your choice works for this visit.",
      );
    }
    setMode(next);
  }
  if (loading)
    return (
      <SafeAreaView style={[s.safe, { justifyContent: "center" }]}>
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  if (mode === "account")
    return (
      <Suspense
        fallback={
          <SafeAreaView style={[s.safe, { justifyContent: "center" }]}>
            <ActivityIndicator color={c.accent} />
          </SafeAreaView>
        }
      >
        <SharedHome onExit={() => void choose(null)} />
      </Suspense>
    );
  if (mode === "offline")
    return <OfflineHome onExit={() => void choose(null)} />;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={[s.page, { maxWidth: 600, paddingTop: 44 }]}
      >
        <View style={s.row}>
          <BrandMark size={45} />
          <Text style={s.brand}>BetweenUs</Text>
        </View>
        <View style={{ gap: 15, marginVertical: 16 }}>
          <Text style={s.eyebrow}>A LITTLE CLARITY, BETWEEN FRIENDS</Text>
          <Text style={s.title}>
            Keep the good times.{"\n"}Keep things clear.
          </Text>
          <Text style={s.body}>
            Money lent, shared games, trips together. A simple place to remember
            who owes what.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.tag}>YOURS, ON THIS DEVICE</Text>
          <Text style={s.section}>Start with offline mode</Text>
          <Text style={s.body}>
            Free personal records and shared-expense vaults. No account, email,
            or internet needed.
          </Text>
          <Button
            title="Use offline — free"
            onPress={() => void choose("offline")}
          />
          <Text style={s.small}>
            Records stay on this device. BetweenUs does not upload or send them
            to anyone.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>Want shared account records?</Text>
          <Text style={s.body}>
            Use email sign-in for the existing confirmation flow. Requires an
            internet connection and a configured service.
          </Text>
          <Button
            title="Use account mode"
            secondary
            onPress={() => void choose("account")}
          />
          <Text style={s.small}>
            Offline records stay separate. No subscription or payment is
            collected in this app.
          </Text>
        </View>
        {!!error && <Text style={s.error}>{error}</Text>}
        <Text style={[s.small, { textAlign: "center" }]}>
          Built on trust. A record, not a payment service.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
