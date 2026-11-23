import assert from "node:assert/strict";
import { test } from "node:test";
import { palettes } from "../src/appearance/colors";
import {
  APPEARANCE_KEY,
  readAppearance,
  resolveAppearance,
  writeAppearance,
} from "../src/appearance/preference";

test("appearance follows system changes unless light or dark is chosen", () => {
  assert.equal(resolveAppearance("system", "dark"), "dark");
  assert.equal(resolveAppearance("system", "light"), "light");
  assert.equal(resolveAppearance("system", null), "light");
  assert.equal(resolveAppearance("dark", "light"), "dark");
  assert.equal(resolveAppearance("light", "dark"), "light");
});

test("all appearance choices survive a new read without modifying other keys", async () => {
  const values = new Map([["betweenus.offline-ledger.v1", "existing ledger"]]);
  const storage = {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
  for (const choice of ["dark", "light", "system"] as const) {
    await writeAppearance(storage, choice);
    assert.equal(await readAppearance(storage), choice);
    assert.equal(values.get(APPEARANCE_KEY), choice);
    assert.equal(values.get("betweenus.offline-ledger.v1"), "existing ledger");
  }
});

test("missing, invalid and unavailable storage restore System", async () => {
  for (const value of [null, '""', '{"theme":"dark"}', "DARK"]) {
    assert.equal(
      await readAppearance({ getItem: async () => value }),
      "system",
    );
  }
  assert.equal(
    await readAppearance({
      async getItem() {
        throw new Error("Storage unavailable");
      },
    }),
    "system",
  );
});

test("write failure is observable and the same selection can be retried", async () => {
  let value = "light";
  let rejectWrite = true;
  const storage = {
    async getItem() {
      return value;
    },
    async setItem(_key: string, next: string) {
      if (rejectWrite) throw new Error("Storage unavailable");
      value = next;
    },
  };
  await assert.rejects(writeAppearance(storage, "dark"), /Storage unavailable/);
  assert.equal(await readAppearance(storage), "light");
  rejectWrite = false;
  assert.equal(await writeAppearance(storage, "dark"), "dark");
  assert.equal(await readAppearance(storage), "dark");
});

test("themed text meets normal-text contrast across its surfaces", () => {
  function luminance(color: string) {
    const channel = (offset: number) => {
      const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
  }
  for (const [scheme, colors] of Object.entries(palettes)) {
    const pairs = [
      ["ink", "paper"],
      ["ink", "surface"],
      ["ink", "highlight"],
      ["ink", "selection"],
      ["muted", "surface"],
      ["muted", "highlight"],
      ["muted", "nav"],
      ["placeholder", "surface"],
      ["accent", "paper"],
      ["accent", "pale"],
      ["accent", "selected"],
      ["onAction", "action"],
      ["onBalance", "balance"],
      ["onBalanceMuted", "balance"],
      ["errorText", "errorSurface"],
    ] as const;
    for (const [foreground, background] of pairs) {
      const a = luminance(colors[foreground]);
      const b = luminance(colors[background]);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(
        ratio >= 4.5,
        `${scheme} ${foreground}/${background}: ${ratio}`,
      );
    }
  }
});
