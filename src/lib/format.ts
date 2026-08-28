export function todayISO(d: Date = new Date()): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function fmtDuration(min?: number | null): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function fmtHms(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const SWEDISH_DOW = [
  "Söndag",
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
];

const SWEDISH_MONTH = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

export function fmtDateLong(iso: string): string {
  const d = parseISO(iso);
  return `${SWEDISH_DOW[d.getDay()]} ${d.getDate()} ${SWEDISH_MONTH[d.getMonth()]}`;
}

export function fmtDateShort(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function dowSwedish(dow: number): string {
  // dow: 1=Mon..7=Sun
  return SWEDISH_DOW[dow % 7];
}
