export const APPEARANCE_KEY = "betweenus.appearance.v1";
export const appearancePreferences = ["system", "light", "dark"] as const;
export type AppearancePreference = (typeof appearancePreferences)[number];
export type AppColorScheme = Exclude<AppearancePreference, "system">;

interface AppearanceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function resolveAppearance(
  preference: AppearancePreference,
  system: AppColorScheme | null | undefined,
): AppColorScheme {
  return preference === "system" ? (system ?? "light") : preference;
}

export async function readAppearance(
  storage: Pick<AppearanceStorage, "getItem">,
): Promise<AppearancePreference> {
  try {
    const value = await storage.getItem(APPEARANCE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export async function writeAppearance(
  storage: Pick<AppearanceStorage, "setItem">,
  preference: AppearancePreference,
): Promise<AppearancePreference> {
  await storage.setItem(APPEARANCE_KEY, preference);
  return preference;
}
