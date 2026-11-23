import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Appearance, Platform, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palettes, type ThemeColors } from "./colors";
import {
  readAppearance,
  resolveAppearance,
  writeAppearance,
  type AppColorScheme,
  type AppearancePreference,
} from "./preference";

interface AppearanceState {
  scheme: AppColorScheme;
  colors: ThemeColors;
  preference: AppearancePreference;
  busy: boolean;
  error: string;
  changePreference: (next: AppearancePreference) => Promise<void>;
}

const AppearanceContext = createContext<AppearanceState | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mounted, setMounted] = useState(false);
  const [preference, setPreference] = useState<AppearancePreference>("system");
  const [restoring, setRestoring] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const writing = useRef(false);
  // Use the same first render on web and in the static export.
  const scheme = resolveAppearance(
    preference,
    Platform.OS === "web" && !mounted ? null : systemScheme,
  );
  const colors = palettes[scheme];

  useEffect(() => {
    let active = true;
    setMounted(true);
    void readAppearance(AsyncStorage).then((saved) => {
      if (active) {
        setPreference(saved);
        setRestoring(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(preference === "system" ? "auto" : preference);
    }
  }, [preference]);

  useEffect(() => {
    if (Platform.OS === "web" && mounted) {
      const style = document.documentElement.style;
      style.colorScheme = scheme;
      style.backgroundColor = colors.paper;
    }
  }, [colors.paper, mounted, scheme]);

  async function changePreference(next: AppearancePreference) {
    if (restoring || writing.current || next === preference) return;
    writing.current = true;
    setSaving(true);
    setError("");
    try {
      setPreference(await writeAppearance(AsyncStorage, next));
    } catch {
      setError("Appearance could not be saved. Try selecting it again.");
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  return (
    <AppearanceContext.Provider
      value={{
        scheme,
        colors,
        preference,
        busy: restoring || saving,
        error,
        changePreference,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const appearance = useContext(AppearanceContext);
  if (!appearance) throw new Error("AppearanceProvider is required.");
  return appearance;
}
