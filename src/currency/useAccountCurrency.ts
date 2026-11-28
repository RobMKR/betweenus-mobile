import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { request } from "../api";
import {
  defaultSettings,
  validateSettings,
  type CurrencySettings,
} from "./model";

const cachePrefix = "betweenus.account-currency.v1.";
const cacheWrites = new Map<string, Promise<void>>();

function cacheSettings(key: string, settings: CurrencySettings) {
  const operation = (cacheWrites.get(key) ?? Promise.resolve())
    .then(() => AsyncStorage.setItem(key, JSON.stringify(settings)))
    .catch(() => {});
  cacheWrites.set(key, operation);
  void operation.then(() => {
    if (cacheWrites.get(key) === operation) cacheWrites.delete(key);
  });
}

async function readCache(key: string) {
  await cacheWrites.get(key);
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? null : validateSettings(JSON.parse(raw));
}

export function useAccountCurrency(owner: string, token: string) {
  const fallback = useMemo(defaultSettings, []);
  const [state, setState] = useState<{
    owner: string;
    settings: CurrencySettings;
    available: boolean;
    message: string;
  } | null>(null);
  const sequence = useRef(0);
  const writing = useRef<{ owner: string; token: string } | null>(null);
  const identity = useRef({ owner, token });
  identity.current = { owner, token };

  const load = useCallback(async () => {
    if (writing.current?.owner === owner && writing.current.token === token)
      return;
    const operation = ++sequence.current;
    const current = () =>
      operation === sequence.current &&
      identity.current.owner === owner &&
      identity.current.token === token;
    const key = cachePrefix + encodeURIComponent(owner);
    setState((previous) =>
      previous?.owner === owner
        ? {
            ...previous,
            available: false,
            message: "Loading currency settings…",
          }
        : null,
    );
    const cached = readCache(key).catch(() => null);
    const result = request<CurrencySettings>("/currency-settings", token)
      .then(validateSettings)
      .catch(() => null);
    const cachedSettings = await cached;
    if (current() && cachedSettings)
      setState({
        owner,
        settings: cachedSettings,
        available: false,
        message: "Loading currency settings…",
      });
    try {
      const settings = await result;
      if (!settings) throw new Error("Could not load account settings.");
      if (!current()) return;
      setState({ owner, settings, available: true, message: "" });
      cacheSettings(key, settings);
    } catch {
      if (current())
        setState({
          owner,
          settings: cachedSettings ?? fallback,
          available: false,
          message: cachedSettings
            ? "Account settings unavailable. Showing the last saved currency and rates on this device."
            : "Account currency settings unavailable. Showing USD until you reconnect and reload.",
        });
    }
  }, [owner, token, fallback]);

  useEffect(() => {
    if (owner && token) void load();
    return () => {
      sequence.current++;
    };
  }, [load, owner, token]);

  async function save(settings: CurrencySettings) {
    if (
      state?.owner !== owner ||
      !state.available ||
      (writing.current?.owner === owner && writing.current.token === token)
    )
      throw new Error("Reload account currency settings before saving.");
    const write = { owner, token };
    writing.current = write;
    const operation = ++sequence.current;
    try {
      const saved = validateSettings(
        await request<CurrencySettings>(
          "/currency-settings",
          token,
          settings,
          "PUT",
        ),
      );
      if (
        identity.current.owner !== owner ||
        identity.current.token !== token ||
        sequence.current !== operation
      )
        throw new Error(
          "The active account changed. Reopen currency settings.",
        );
      setState({ owner, settings: saved, available: true, message: "" });
      cacheSettings(cachePrefix + encodeURIComponent(owner), saved);
    } finally {
      if (writing.current === write) writing.current = null;
    }
  }

  return {
    settings: state?.owner === owner ? state.settings : fallback,
    unavailable:
      state?.owner === owner ? state.message : "Loading currency settings…",
    save,
    reload: load,
  };
}
