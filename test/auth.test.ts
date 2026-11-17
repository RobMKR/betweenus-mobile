import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestEmailCode,
  verifyEmailCode,
  type EmailAuth,
} from "../src/auth-flow";
import { createSecureStorage } from "../src/session-storage";
test("email OTP validates and normalizes request; verification propagates wrong/expired code", async () => {
  const calls: unknown[] = [];
  const auth: EmailAuth = {
    signInWithOtp: async (input) => {
      calls.push(input);
      return { error: null };
    },
    verifyOtp: async (input) => {
      calls.push(input);
      return {
        error:
          input.token === "123456"
            ? null
            : { message: "Code expired or invalid" },
      };
    },
  };
  await assert.rejects(requestEmailCode(auth, "invalid"), /valid email/);
  assert.equal(calls.length, 0);
  await requestEmailCode(auth, " Alice@Example.com ");
  assert.deepEqual(calls[0], {
    email: "alice@example.com",
    options: { shouldCreateUser: true },
  });
  await assert.rejects(
    verifyEmailCode(auth, "alice@example.com", "abcd"),
    /numeric code/,
  );
  await assert.rejects(
    verifyEmailCode(auth, "alice@example.com", "000000"),
    /expired or invalid/,
  );
  await verifyEmailCode(auth, " Alice@Example.com ", "123456");
  assert.deepEqual(calls.at(-1), {
    email: "alice@example.com",
    token: "123456",
    type: "email",
  });
});
test("request errors do not report successful code delivery", async () => {
  const auth: EmailAuth = {
    signInWithOtp: async () => ({ error: { message: "Too many requests" } }),
    verifyOtp: async () => ({ error: null }),
  };
  await assert.rejects(
    requestEmailCode(auth, "a@example.com"),
    /Too many requests/,
  );
});
test("secure session storage chunks long unicode sessions and deletes previous generations on replace and signout", async () => {
  const data = new Map<string, string>();
  const storage = createSecureStorage({
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      assert.ok(Buffer.byteLength(v) <= 2048);
      data.set(k, v);
    },
    deleteItemAsync: async (k) => {
      data.delete(k);
    },
  });
  const session = "🔐".repeat(3000);
  await storage.setItem("auth", session);
  assert.equal(await storage.getItem("auth"), session);
  await storage.setItem("auth", "replacement");
  assert.equal(data.size, 2);
  assert.equal(await storage.getItem("auth"), "replacement");
  await storage.removeItem("auth");
  assert.equal(data.size, 0);
  assert.equal(await storage.getItem("auth"), null);
});
test("incomplete secure session write cannot replace a previous complete session", async () => {
  const data = new Map<string, string>();
  let fail = false;
  const storage = createSecureStorage({
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (fail && k !== "auth") throw new Error("disk unavailable");
      data.set(k, v);
    },
    deleteItemAsync: async (k) => {
      data.delete(k);
    },
  });
  await storage.setItem("auth", "old");
  fail = true;
  await assert.rejects(storage.setItem("auth", "new"), /disk unavailable/);
  assert.equal(await storage.getItem("auth"), "old");
});

test("oversized secure session is rejected without replacing the old one", async () => {
  const data = new Map<string, string>();
  const storage = createSecureStorage({
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      data.set(k, v);
    },
    deleteItemAsync: async (k) => {
      data.delete(k);
    },
  });
  await storage.setItem("auth", "old");
  await assert.rejects(
    storage.setItem("auth", "x".repeat(450 * 128 + 1)),
    /capacity/,
  );
  assert.equal(await storage.getItem("auth"), "old");
});
