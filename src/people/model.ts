export type PersonSource = "custom" | "contact";
export type SavedPerson = {
  id: string;
  name: string;
  source: PersonSource;
  email: string | null;
  phone: string | null;
  createdAt: string;
};
export type PersonInput = {
  name: string;
  source: PersonSource;
  email?: string | null;
  phone?: string | null;
};
export function personFields(
  input: PersonInput,
): Omit<SavedPerson, "id" | "createdAt"> {
  const name = input.name.trim();
  if (!name || name.length > 100)
    throw new Error("Enter a name up to 100 characters.");
  if (input.source !== "custom" && input.source !== "contact")
    throw new Error("Choose a valid person source.");
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (
    email &&
    (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    throw new Error("Enter a valid email, or leave it blank.");
  if (
    phone &&
    (phone.length > 40 ||
      !/[0-9]/.test(phone) ||
      !/^[+0-9().\- ]+$/.test(phone))
  )
    throw new Error(
      "Enter a phone number up to 40 characters, or leave it blank.",
    );
  return { name, source: input.source, email, phone };
}
export function validateSavedPerson(person: SavedPerson) {
  if (
    !person ||
    typeof person.id !== "string" ||
    !person.id ||
    person.id.length > 200 ||
    typeof person.name !== "string" ||
    (person.email !== null && typeof person.email !== "string") ||
    (person.phone !== null && typeof person.phone !== "string") ||
    !Number.isFinite(Date.parse(person.createdAt))
  )
    throw new Error("Invalid saved person.");
  const normalized = personFields(person);
  if (
    normalized.name !== person.name ||
    normalized.email !== person.email ||
    normalized.phone !== person.phone
  )
    throw new Error("Invalid saved person fields.");
  return person;
}
export function personRequest(input: PersonInput) {
  const fields = personFields(input);
  return {
    name: fields.name,
    source: fields.source,
    ...(fields.email ? { email: fields.email } : {}),
    ...(fields.phone ? { phone: fields.phone } : {}),
  };
}
