export type DebtStatus = 'pending' | 'accepted' | 'disputed';
export type Debt = { id: string; lenderId: string; borrowerId: string; lenderEmail: string; borrowerEmail: string; amountMinor: number; currency: string; description: string; status: DebtStatus; createdAt: string; history: Array<{id?: string; action?: string; type?: string; reason?: string; createdAt: string; actorEmail?: string}> };
export type Balance = { currency: string; receivableMinor: number; payableMinor: number; netMinor: number };
export const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
export async function request<T>(path: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : {body: JSON.stringify(body)}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.message || result.error?.message || `Request failed (${response.status})`);
  return result as T;
}
export function amountToMinor(input: string): number | null {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, cents = ''] = input.trim().split('.');
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
export function money(minor: number, currency = 'AED') { return `${currency} ${(minor / 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`; }
