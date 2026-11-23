import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  AppearanceProvider,
  useAppearance,
} from "../src/appearance/AppearanceProvider";

function ThemedStack() {
  const { scheme, colors } = useAppearance();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.paper,
      card: colors.surface,
      text: colors.ink,
      border: colors.line,
      primary: colors.accent,
      notification: colors.errorText,
    },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

export default function Layout() {
  return (
    <AppearanceProvider>
      <ThemedStack />
    </AppearanceProvider>
  );
}
