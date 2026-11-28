import type { Currency } from "./currency/model";
export { amountToMinor, money } from "./currency/model";
export type DebtStatus = "pending" | "accepted" | "disputed";
export type Debt = {
  id: string;
  lenderId: string;
  borrowerId: string | null;
  lenderEmail: string;
  borrowerEmail: string;
  amountMinor: number;
  currency: Currency;
  description: string;
  status: DebtStatus;
  createdAt: string;
  history: Array<{
    id?: string;
    action?: string;
    type?: string;
    reason?: string;
    createdAt: string;
    actorEmail?: string;
  }>;
};
export type Balance = {
  currency: Currency;
  receivableMinor: number;
  payableMinor: number;
  netMinor: number;
};
export const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === "true";
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001"
).replace(/\/$/, "");
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  token: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiRequestError(
      typeof result.error === "string"
        ? result.error
        : result.message ||
            result.error?.message ||
            `Request failed (${response.status})`,
      response.status,
      typeof result.error?.code === "string" ? result.error.code : undefined,
    );
  return result as T;
}
