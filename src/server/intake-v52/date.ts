const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getLondonTodayString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to resolve Europe/London date");
  return `${year}-${month}-${day}`;
}

export function daysUntilCalendarDate(value: string, now: Date = new Date()): number | null {
  if (!isValidCalendarDate(value)) return null;
  const today = getLondonTodayString(now);
  const targetMs = Date.parse(`${value}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return Math.round((targetMs - todayMs) / 86_400_000);
}

export function isPastLondonDate(value: string, now: Date = new Date()): boolean {
  const days = daysUntilCalendarDate(value, now);
  return days !== null && days < 0;
}
