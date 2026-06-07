import { FREQUENCY_OPTIONS } from "@shared/schema";

// Convert a stored inspectionFrequencyDays value back to a FREQUENCY_OPTIONS
// key (and custom day count) for the picker.
export function frequencyToValue(days: number | null | undefined): { value: string; customDays: number } {
  if (days == null) return { value: "oneoff", customDays: 30 };
  const exact = FREQUENCY_OPTIONS.find((o) => o.days === days);
  if (exact) return { value: exact.value, customDays: days };
  return { value: "custom", customDays: days };
}

// Map a picker selection to the integer day count stored on the site.
export function valueToDays(value: string, customDays: number): number | null {
  if (value === "oneoff") return null;
  if (value === "custom") return Math.max(1, customDays || 1);
  const opt = FREQUENCY_OPTIONS.find((o) => o.value === value);
  return opt?.days ?? null;
}

export interface DueInfo {
  label: string;
  tone: "overdue" | "soon" | "upcoming" | "none";
  daysUntil: number | null;
}

// Build a human readable due label from a YYYY-MM-DD next due date.
export function dueInfo(nextDueDate: string | null | undefined): DueInfo {
  if (!nextDueDate) return { label: "", tone: "none", daysUntil: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDueDate + "T00:00:00");
  const diffMs = due.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) {
    const n = Math.abs(days);
    return { label: `Overdue by ${n} day${n === 1 ? "" : "s"}`, tone: "overdue", daysUntil: days };
  }
  if (days === 0) return { label: "Due today", tone: "soon", daysUntil: 0 };
  if (days <= 7) return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "soon", daysUntil: days };
  return { label: `Due in ${days} days`, tone: "upcoming", daysUntil: days };
}
