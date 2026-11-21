export type PhoneContact = {
  name: string;
  emails: string[];
  phones: string[];
};

export type PhoneContactResult =
  | { status: "selected"; contact: PhoneContact }
  | {
      status: "cancelled" | "denied" | "unavailable" | "error";
      message?: string;
    };

type Permission = {
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: "all" | "limited" | "none";
};

type SelectedDetails = {
  fullName?: string | null;
  emails?: { address?: string }[];
  phones?: { number?: string }[];
};

/** Narrow injectable boundary: there is deliberately no address-book enumeration API. */
export type PhoneContactsAccess = {
  getPermissions(): Promise<Permission>;
  requestPermissions(): Promise<Permission>;
  pick(): Promise<null | { getSelectedDetails(): Promise<SelectedDetails> }>;
};

const fallback = "You can add this person using custom entry.";

const cleanValues = (values: (string | undefined)[]) => [
  ...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)),
];

/** Called only from the explicit Choose phone contact action; no launch-time work. */
export async function choosePhoneContactWithAccess(
  access: PhoneContactsAccess,
): Promise<PhoneContactResult> {
  try {
    let permission = await access.getPermissions();
    if (!permission.granted && permission.canAskAgain) {
      permission = await access.requestPermissions();
    }
    // iOS limited access is granted. Restricted access is exposed as denied by Expo.
    if (!permission.granted || permission.accessPrivileges === "none") {
      return {
        status: "denied",
        message: `Contacts access is unavailable or denied. ${fallback}`,
      };
    }
    const selected = await access.pick();
    if (!selected) return { status: "cancelled" };
    const details = await selected.getSelectedDetails();
    // Project only reviewable metadata: never pass through native IDs or other fields.
    return {
      status: "selected",
      contact: {
        name: details.fullName?.trim() ?? "",
        emails: cleanValues(
          (details.emails ?? []).map((email) => email.address),
        ),
        phones: cleanValues(
          (details.phones ?? []).map((phone) => phone.number),
        ),
      },
    };
  } catch {
    // A limited-access picker selection can be unreadable; do not imply it imported.
    return {
      status: "error",
      message: `The selected contact could not be read. ${fallback}`,
    };
  }
}

export async function choosePhoneContact(): Promise<PhoneContactResult> {
  let contacts: typeof import("expo-contacts");
  try {
    contacts = await import("expo-contacts");
  } catch {
    return {
      status: "unavailable",
      message: `Phone Contacts is unavailable on this device. ${fallback}`,
    };
  }
  return choosePhoneContactWithAccess({
    getPermissions: () => contacts.getPermissionsAsync(),
    requestPermissions: () => contacts.requestPermissionsAsync(),
    pick: async () => {
      const selected = await contacts.Contact.presentPicker();
      return selected
        ? {
            getSelectedDetails: () =>
              selected.getDetails([
                contacts.ContactField.FULL_NAME,
                contacts.ContactField.EMAILS,
                contacts.ContactField.PHONES,
              ] as const),
          }
        : null;
    },
  });
}
