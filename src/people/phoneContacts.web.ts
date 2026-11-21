import type { PhoneContactResult } from "./phoneContacts";

// Web never imports or requests the native Contacts module.
export async function choosePhoneContact(): Promise<PhoneContactResult> {
  return {
    status: "unavailable",
    message:
      "Phone Contacts is unavailable in this browser. Use custom entry to add a person.",
  };
}
