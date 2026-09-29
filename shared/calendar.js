export const calendarName = (calendar) =>
  calendar === "persian" ? "هجری شمسی" : "میلادی";
export function formatDate(value, calendar = "gregory", options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-AF", {
    calendar,
    numberingSystem: "latn",
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...options,
  }).format(new Date(value));
}
const partsFormatters = new Map();
export function dateParts(value, calendar = "gregory") {
  if (!partsFormatters.has(calendar))
    partsFormatters.set(
      calendar,
      new Intl.DateTimeFormat("en-US", {
        calendar,
        numberingSystem: "latn",
        timeZone: "Asia/Kabul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  const parts = partsFormatters.get(calendar).formatToParts(new Date(value));
  return Object.fromEntries(
    parts
      .filter((p) => ["year", "month", "day"].includes(p.type))
      .map((p) => [p.type, Number(p.value)]),
  );
}
export function dateText(value, calendar = "gregory") {
  if (!value) return "";
  const p = dateParts(value, calendar);
  return `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}`;
}
// Convert a calendar date to an ISO civil date using the same ICU calendar as display.
// Exact round-trip validation rejects impossible dates, including non-leap Esfand 30.
export function parseDate(text, calendar = "gregory") {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (!match) return "";
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  if (calendar === "gregory") {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso
      ? iso
      : "";
  }
  const target = year * 10000 + month * 100 + day;
  let low = Math.floor(Date.UTC(year + 621, 0, 1) / 86400000);
  let high = Math.floor(Date.UTC(year + 622, 5, 1) / 86400000);
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const d = new Date(mid * 86400000);
    const p = dateParts(d, "persian");
    const actual = p.year * 10000 + p.month * 100 + p.day;
    if (actual === target) return d.toISOString().slice(0, 10);
    if (actual < target) low = mid + 1;
    else high = mid - 1;
  }
  return "";
}
export function monthStart(value, calendar = "gregory") {
  const p = dateParts(value, calendar);
  return parseDate(`${p.year}/${p.month}/1`, calendar);
}
