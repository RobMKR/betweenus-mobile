import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import BrandMark from "../BrandMark";
export type Tab = "home" | "people" | "vaults" | "settings";
const tabs: Array<{
  key: Tab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  selected: React.ComponentProps<typeof Ionicons>["name"];
}> = [
  { key: "home", label: "Home", icon: "home-outline", selected: "home" },
  {
    key: "people",
    label: "People",
    icon: "people-outline",
    selected: "people",
  },
  {
    key: "vaults",
    label: "Vaults",
    icon: "albums-outline",
    selected: "albums",
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings-outline",
    selected: "settings",
  },
];
export default function MobileShell({
  tab,
  onTabChange,
  mode,
  children,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  mode: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <BrandMark size={32} />
          <Text style={styles.brandText}>BetweenUs</Text>
        </View>
        <Text style={styles.mode}>{mode}</Text>
      </View>
      <View style={styles.content}>{children}</View>
      <View style={styles.nav} accessibilityRole="tablist">
        {tabs.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: tab === item.key }}
            aria-selected={tab === item.key}
            onPress={() => onTabChange(item.key)}
            style={styles.tab}
          >
            <View style={[styles.icon, tab === item.key && styles.selected]}>
              <Ionicons
                name={tab === item.key ? item.selected : item.icon}
                size={21}
                color={tab === item.key ? "#176b50" : "#7c8981"}
              />
            </View>
            <Text
              style={[
                styles.label,
                tab === item.key && { color: "#176b50", fontWeight: "700" },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f3" },
  header: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandText: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: "#203b35",
  },
  mode: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#71817a",
    flexShrink: 1,
    textAlign: "right",
  },
  content: { flex: 1 },
  nav: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    backgroundColor: "#fdfefb",
    borderTopColor: "#dfe6dc",
    borderTopWidth: 1,
    paddingTop: 6,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  icon: {
    width: 48,
    height: 28,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: "#e3efe4" },
  label: { fontSize: 11, color: "#71817a" },
});
