// src/lib/dateUtil.ts
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date, not UTC — "today" must match the user's wall clock. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Is `s` a real calendar date in YYYY-MM-DD form?
 *
 * This used to be a shape check only, on the reasoning that the sole writer of
 * date state was a native `<input type="date">`, which never hands JS a
 * semantically invalid string (an incomplete edit reports as `""`). That was
 * true — but URL parameters are now a second writer, and a hand-edited or
 * truncated link can carry anything. `0000-00-00` passed the shape check and
 * reached `slotOfYear(0, 0)`, which throws in the render path and blanks the
 * page.
 *
 * So the month/day rules are checked properly. `parseIso` still assumes its
 * input is valid; this is the gate that makes that assumption safe.
 */
export function isIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const max = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= max;
}

export function parseIso(iso: string): { year: number; month: number; day: number } {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Expected an ISO date (YYYY-MM-DD), got "${iso}"`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatDayLabel(iso: string): string {
  const { month, day } = parseIso(iso);
  return `${day} ${MONTHS[month - 1]}`;
}
