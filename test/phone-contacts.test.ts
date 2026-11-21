import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choosePhoneContactWithAccess,
  type PhoneContactsAccess,
} from "../src/people/phoneContacts";
import { choosePhoneContact as chooseOnWeb } from "../src/people/phoneContacts.web";

function fixture(overrides: Partial<PhoneContactsAccess> = {}) {
  const calls: string[] = [];
  const access: PhoneContactsAccess = {
    getPermissions: async () => {
      calls.push("permission");
      return { granted: true, canAskAgain: true, accessPrivileges: "all" };
    },
    requestPermissions: async () => {
      calls.push("request");
      return { granted: true, canAskAgain: true };
    },
    pick: async () => {
      calls.push("pick");
      return {
        getSelectedDetails: async () => {
          calls.push("selected details");
          return {
            fullName: " Alice ",
            emails: [{ address: " alice@example.com " }, { address: "" }],
            phones: [{ number: " +123 " }, { number: "+123" }],
            id: "must-not-escape",
            image: "must-not-escape",
          };
        },
      };
    },
    ...overrides,
  };
  return { access, calls };
}

test("contact work starts only on action; projects selected metadata without native IDs/photos", async () => {
  const { access, calls } = fixture();
  assert.deepEqual(calls, []);
  assert.deepEqual(await choosePhoneContactWithAccess(access), {
    status: "selected",
    contact: { name: "Alice", emails: ["alice@example.com"], phones: ["+123"] },
  });
  assert.deepEqual(calls, ["permission", "pick", "selected details"]);
});

test("limited permission proceeds without requesting broader access", async () => {
  const { access, calls } = fixture({
    getPermissions: async () => ({
      granted: true,
      canAskAgain: true,
      accessPrivileges: "limited",
    }),
  });
  assert.equal((await choosePhoneContactWithAccess(access)).status, "selected");
  assert.deepEqual(calls, ["pick", "selected details"]);
});

test("request permission in context then stop after denial", async () => {
  const { access, calls } = fixture({
    getPermissions: async () => ({ granted: false, canAskAgain: true }),
    requestPermissions: async () => {
      calls.push("request");
      return { granted: false, canAskAgain: false };
    },
  });
  const result = await choosePhoneContactWithAccess(access);
  assert.equal(result.status, "denied");
  assert.deepEqual(calls, ["request"]);
});

test("cannot ask again/restricted access never requests or opens picker", async () => {
  const { access, calls } = fixture({
    getPermissions: async () => ({
      granted: false,
      canAskAgain: false,
      accessPrivileges: "none",
    }),
  });
  assert.equal((await choosePhoneContactWithAccess(access)).status, "denied");
  assert.deepEqual(calls, []);
});

test("new permission grant permits selection", async () => {
  const { access, calls } = fixture({
    getPermissions: async () => ({ granted: false, canAskAgain: true }),
  });
  assert.equal((await choosePhoneContactWithAccess(access)).status, "selected");
  assert.deepEqual(calls, ["request", "pick", "selected details"]);
});

test("native cancellation reads no selected details", async () => {
  const { access } = fixture({ pick: async () => null });
  assert.deepEqual(await choosePhoneContactWithAccess(access), {
    status: "cancelled",
  });
});

test("permission, picker and limited-access detail failures offer custom fallback", async () => {
  const fail = async (): Promise<never> => {
    throw new Error("native private details");
  };
  for (const override of [
    { getPermissions: fail },
    { pick: fail },
    { pick: async () => ({ getSelectedDetails: fail }) },
  ]) {
    const { access } = fixture(override);
    const result = await choosePhoneContactWithAccess(access);
    assert.equal(result.status, "error");
    assert.match(
      "message" in result ? (result.message ?? "") : "",
      /custom entry/,
    );
    assert.doesNotMatch(JSON.stringify(result), /native private/);
  }
});

test("missing optional details stay empty for user review; web gives custom fallback", async () => {
  const { access } = fixture({
    pick: async () => ({ getSelectedDetails: async () => ({}) }),
  });
  assert.deepEqual(await choosePhoneContactWithAccess(access), {
    status: "selected",
    contact: { name: "", emails: [], phones: [] },
  });
  assert.equal((await chooseOnWeb()).status, "unavailable");
});
