export interface EmailAuth {
  signInWithOtp(input: {
    email: string;
    options: { shouldCreateUser: boolean };
  }): Promise<{ error: { message: string } | null }>;
  verifyOtp(input: {
    email: string;
    token: string;
    type: "email";
  }): Promise<{ error: { message: string } | null }>;
}
export function normalizeEmail(email: string) {
  const result = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new Error("Enter a valid email address.");
  return result;
}
export async function requestEmailCode(auth: EmailAuth, email: string) {
  const result = await auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: true },
  });
  if (result.error) throw new Error(result.error.message);
}
export async function verifyEmailCode(
  auth: EmailAuth,
  email: string,
  code: string,
) {
  if (!/^\d{6,10}$/.test(code.trim()))
    throw new Error("Enter the numeric code from your email.");
  const result = await auth.verifyOtp({
    email: normalizeEmail(email),
    token: code.trim(),
    type: "email",
  });
  if (result.error) throw new Error(result.error.message);
}
