import type { Zone } from "./types";

// Classic Coggan power zones as fraction of FTP (upper bounds).
export const ZONE_DEFS: {
  zone: Zone;
  name: string;
  lo: number;
  hi: number;
  color: string;
}[] = [
  { zone: "Z1", name: "Aktiv återhämtning", lo: 0, hi: 0.55, color: "#64748b" },
  { zone: "Z2", name: "Uthållighet", lo: 0.56, hi: 0.75, color: "#22c55e" },
  { zone: "Z3", name: "Tempo", lo: 0.76, hi: 0.9, color: "#eab308" },
  { zone: "Z4", name: "Tröskel (FTP)", lo: 0.91, hi: 1.05, color: "#f97316" },
  { zone: "Z5", name: "VO2max", lo: 1.06, hi: 1.3, color: "#ef4444" },
];

export interface ZoneRange {
  zone: Zone;
  name: string;
  loWatts: number;
  hiWatts: number;
  color: string;
}

export function zonesForFtp(ftp: number): ZoneRange[] {
  return ZONE_DEFS.map((z) => ({
    zone: z.zone,
    name: z.name,
    loWatts: Math.round(z.lo * ftp),
    hiWatts: Math.round(z.hi * ftp),
    color: z.color,
  }));
}

export function wattsForZone(ftp: number, zone: Zone): [number, number] {
  const def = ZONE_DEFS.find((z) => z.zone === zone) ?? ZONE_DEFS[1];
  return [Math.round(def.lo * ftp), Math.round(def.hi * ftp)];
}

export function zoneColor(zone: Zone): string {
  return ZONE_DEFS.find((z) => z.zone === zone)?.color ?? "#64748b";
}
