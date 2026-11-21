import { validDate } from "./model";
export type EventDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onEditingChange?: (editing: boolean) => void;
  disabled?: boolean;
};
/** Calendar parts, never UTC serialization: event dates are not instants. */
export function localCalendarDate(date = new Date()): string {
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid calendar date.");
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function pickerDate(value: string): Date {
  validDate(value);
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date();
  result.setHours(12, 0, 0, 0);
  result.setFullYear(year, month - 1, day);
  return result;
}
/** Dismissal has no selected value and therefore cannot overwrite the date. */
export function selectedCalendarDate(date?: Date): string | null {
  if (!date || !Number.isFinite(date.getTime())) return null;
  try {
    return validDate(localCalendarDate(date));
  } catch {
    return null;
  }
}
