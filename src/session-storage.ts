export interface KeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
// SecureStore values are kept under platform limits. A manifest is committed last;
// generations prevent a partially written session being read as a complete value.
export function createSecureStorage(store: KeyStore) {
  async function removeGeneration(key: string, raw: string | null) {
    if (!raw) return;
    const manifest = JSON.parse(raw) as { generation: string; count: number };
    for (let i = 0; i < manifest.count; i++)
      await store.deleteItemAsync(`${key}.${manifest.generation}.${i}`);
  }
  return {
    async getItem(key: string) {
      const raw = await store.getItemAsync(key);
      if (!raw) return null;
      const m = JSON.parse(raw) as { generation: string; count: number };
      if (!Number.isInteger(m.count) || m.count < 1 || m.count > 128)
        throw new Error("Invalid session storage");
      let value = "";
      for (let i = 0; i < m.count; i++) {
        const chunk = await store.getItemAsync(`${key}.${m.generation}.${i}`);
        if (chunk === null) return null;
        value += chunk;
      }
      return value;
    },
    async setItem(key: string, value: string) {
      const old = await store.getItemAsync(key);
      const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const points = Array.from(value);
      const chunks: string[] = [];
      for (let i = 0; i < points.length; i += 450)
        chunks.push(points.slice(i, i + 450).join(""));
      if (!chunks.length) chunks.push("");
      if (chunks.length > 128)
        throw new Error("Session exceeds secure storage capacity");
      try {
        for (let i = 0; i < chunks.length; i++)
          await store.setItemAsync(`${key}.${generation}.${i}`, chunks[i]);
        await store.setItemAsync(
          key,
          JSON.stringify({ generation, count: chunks.length }),
        );
      } catch (error) {
        await Promise.allSettled(
          chunks.map((_, i) =>
            store.deleteItemAsync(`${key}.${generation}.${i}`),
          ),
        );
        throw error;
      }
      await removeGeneration(key, old);
    },
    async removeItem(key: string) {
      const old = await store.getItemAsync(key);
      await store.deleteItemAsync(key);
      await removeGeneration(key, old);
    },
  };
}
