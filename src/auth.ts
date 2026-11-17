import { createClient, processLock } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createSecureStorage } from "./session-storage";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const authConfigured =
  !!url &&
  !!key &&
  url.startsWith("https://") &&
  !url.includes("your-project") &&
  key !== "your-public-publishable-key";

const webStorage = {
  getItem: async (key: string) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};
export const sessionStorage =
  Platform.OS === "web" ? webStorage : createSecureStorage(SecureStore);
export const SESSION_KEY = "betweenus-auth-session";
export const supabase = authConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: sessionStorage,
        storageKey: SESSION_KEY,
        ...(Platform.OS === "web" ? {} : { lock: processLock }),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
