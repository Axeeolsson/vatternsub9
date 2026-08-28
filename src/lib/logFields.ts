import type { SessionType } from "./types";
import {
  Footprints,
  Mountain,
  PersonStanding,
  Waves,
  Sailboat,
  Bike,
  Snowflake,
  CircleDot,
  Flag,
  Dumbbell,
  Flower2,
  Plus,
  type LucideIcon,
} from "lucide-react";

// A field descriptor drives one input in the log form.
export type FieldKey =
  | "durationMin"
  | "distanceKm"
  | "distanceM"
  | "avgSpeedKmh"
  | "paceMinKm" // derived, display-only
  | "avgWatts"
  | "normalizedWatts"
  | "avgHr"
  | "maxHr"
  | "avgCadence"
  | "elevationM"
  | "calories"
  | "games" // e.g. sets/games for racket sports
  | "ftpWatts" // special: also records an FTP test
  | "rpe"
  | "intervals"
  | "notes";

export interface FieldDef {
  key: FieldKey;
  label: string;
  unit?: string;
  kind: "number" | "text" | "rpe" | "intervals";
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  /** true = maps to a first-class LoggedSession column, else goes in metrics */
  column?: boolean;
}

export const FIELD_DEFS: Record<FieldKey, FieldDef> = {
  durationMin: { key: "durationMin", label: "Tid", unit: "min", kind: "number", inputMode: "numeric", column: true, placeholder: "t.ex. 90" },
  distanceKm: { key: "distanceKm", label: "Distans", unit: "km", kind: "number", inputMode: "decimal", column: true },
  distanceM: { key: "distanceM", label: "Distans", unit: "m", kind: "number", inputMode: "numeric" },
  avgSpeedKmh: { key: "avgSpeedKmh", label: "Snittfart", unit: "km/h", kind: "number", inputMode: "decimal", column: true },
  paceMinKm: { key: "paceMinKm", label: "Tempo", unit: "min/km", kind: "text" },
  avgWatts: { key: "avgWatts", label: "Snitt-effekt", unit: "W", kind: "number", inputMode: "numeric", column: true },
  normalizedWatts: { key: "normalizedWatts", label: "Normaliserad (NP)", unit: "W", kind: "number", inputMode: "numeric", column: true },
  avgHr: { key: "avgHr", label: "Snittpuls", unit: "bpm", kind: "number", inputMode: "numeric", column: true },
  maxHr: { key: "maxHr", label: "Maxpuls", unit: "bpm", kind: "number", inputMode: "numeric" },
  avgCadence: { key: "avgCadence", label: "Snittkadens", unit: "rpm", kind: "number", inputMode: "numeric" },
  elevationM: { key: "elevationM", label: "Höjdmeter", unit: "m", kind: "number", inputMode: "numeric" },
  calories: { key: "calories", label: "Kalorier", unit: "kcal", kind: "number", inputMode: "numeric" },
  games: { key: "games", label: "Set / matcher", kind: "number", inputMode: "numeric" },
  ftpWatts: { key: "ftpWatts", label: "Nytt FTP-värde", unit: "W", kind: "number", inputMode: "numeric", placeholder: "spara som FTP-test" },
  rpe: { key: "rpe", label: "Ansträngning (RPE)", kind: "rpe", column: true },
  intervals: { key: "intervals", label: "Intervaller", kind: "intervals", column: true },
  notes: { key: "notes", label: "Anteckningar", kind: "text", column: true },
};

// Tailored field sets per built-in cycling session type.
export const SESSION_FIELDS: Record<SessionType, FieldKey[]> = {
  rest: ["notes"],
  recovery: ["durationMin", "avgWatts", "avgHr", "rpe", "notes"],
  endurance: ["durationMin", "distanceKm", "avgSpeedKmh", "avgWatts", "avgHr", "rpe", "notes"],
  long: ["durationMin", "distanceKm", "avgSpeedKmh", "avgWatts", "normalizedWatts", "avgHr", "elevationM", "rpe", "notes"],
  cadence: ["durationMin", "avgCadence", "avgWatts", "avgHr", "rpe", "notes"],
  tempo: ["durationMin", "avgWatts", "normalizedWatts", "avgHr", "rpe", "notes"],
  threshold: ["durationMin", "intervals", "avgWatts", "normalizedWatts", "avgHr", "ftpWatts", "rpe", "notes"],
  vo2: ["durationMin", "intervals", "avgWatts", "maxHr", "rpe", "notes"],
  intervals: ["durationMin", "intervals", "avgWatts", "avgHr", "rpe", "notes"],
  strength: ["durationMin", "rpe", "notes"],
  race: ["durationMin", "distanceKm", "avgSpeedKmh", "avgWatts", "normalizedWatts", "avgHr", "rpe", "notes"],
  other: ["durationMin", "rpe", "notes"],
};

// The "Annat" activity catalogue. Each activity gets a relevant field set.
export interface ActivityDef {
  id: string;
  label: string;
  icon: LucideIcon;
  fields: FieldKey[];
  /**
   * How much this activity's training transfers to cycling fitness (0..1),
   * following the specificity principle: cross-training builds general aerobic
   * base but only partially carries over to cycling FTP. Cycling-like modes
   * (spinning/MTB/gravel) transfer most; running/XC-ski/rowing a fair amount;
   * ball sports and gym little; yoga/mobility almost none. Used to weight the
   * volume that drives the (bounded) consistency drift — it never sets FTP via
   * power evidence and never counts as durability (those stay cycling-specific).
   */
  transferFactor: number;
}

const timeOnly: FieldKey[] = ["durationMin", "rpe", "notes"];
const distTime: FieldKey[] = ["durationMin", "distanceKm", "avgHr", "rpe", "notes"];

export const ACTIVITIES: ActivityDef[] = [
  { id: "running", label: "Löpning", icon: Footprints, transferFactor: 0.6, fields: ["durationMin", "distanceKm", "paceMinKm", "avgHr", "maxHr", "elevationM", "rpe", "notes"] },
  { id: "trailrunning", label: "Terränglöpning", icon: Mountain, transferFactor: 0.6, fields: ["durationMin", "distanceKm", "elevationM", "avgHr", "rpe", "notes"] },
  { id: "walking", label: "Promenad", icon: PersonStanding, transferFactor: 0.2, fields: ["durationMin", "distanceKm", "rpe", "notes"] },
  { id: "hiking", label: "Vandring", icon: Mountain, transferFactor: 0.2, fields: ["durationMin", "distanceKm", "elevationM", "rpe", "notes"] },
  { id: "swimming", label: "Simning", icon: Waves, transferFactor: 0.4, fields: ["durationMin", "distanceM", "avgHr", "rpe", "notes"] },
  { id: "rowing", label: "Rodd / roddmaskin", icon: Sailboat, transferFactor: 0.7, fields: ["durationMin", "distanceM", "avgWatts", "avgHr", "rpe", "notes"] },
  { id: "spinning", label: "Spinning", icon: Bike, transferFactor: 0.85, fields: ["durationMin", "avgWatts", "avgHr", "rpe", "notes"] },
  { id: "mtb", label: "Mountainbike", icon: Bike, transferFactor: 0.9, fields: ["durationMin", "distanceKm", "avgWatts", "avgHr", "elevationM", "rpe", "notes"] },
  { id: "gravel", label: "Gravel", icon: Bike, transferFactor: 0.9, fields: ["durationMin", "distanceKm", "avgSpeedKmh", "avgWatts", "avgHr", "rpe", "notes"] },
  { id: "xcskiing", label: "Längdskidor", icon: Snowflake, transferFactor: 0.7, fields: distTime },
  { id: "alpine", label: "Utförsåkning", icon: Snowflake, transferFactor: 0.2, fields: timeOnly },
  { id: "skating", label: "Skridskor", icon: Snowflake, transferFactor: 0.4, fields: ["durationMin", "distanceKm", "rpe", "notes"] },
  { id: "tennis", label: "Tennis", icon: CircleDot, transferFactor: 0.25, fields: ["durationMin", "games", "rpe", "notes"] },
  { id: "padel", label: "Padel", icon: CircleDot, transferFactor: 0.25, fields: ["durationMin", "games", "rpe", "notes"] },
  { id: "squash", label: "Squash", icon: CircleDot, transferFactor: 0.25, fields: ["durationMin", "games", "rpe", "notes"] },
  { id: "badminton", label: "Badminton", icon: CircleDot, transferFactor: 0.25, fields: ["durationMin", "games", "rpe", "notes"] },
  { id: "football", label: "Fotboll", icon: CircleDot, transferFactor: 0.25, fields: timeOnly },
  { id: "floorball", label: "Innebandy", icon: CircleDot, transferFactor: 0.25, fields: timeOnly },
  { id: "basket", label: "Basket", icon: CircleDot, transferFactor: 0.25, fields: timeOnly },
  { id: "handball", label: "Handboll", icon: CircleDot, transferFactor: 0.25, fields: timeOnly },
  { id: "icehockey", label: "Ishockey", icon: CircleDot, transferFactor: 0.25, fields: timeOnly },
  { id: "volleyball", label: "Volleyboll", icon: CircleDot, transferFactor: 0.25, fields: timeOnly },
  { id: "golf", label: "Golf", icon: Flag, transferFactor: 0.2, fields: ["durationMin", "distanceKm", "notes"] },
  { id: "gym", label: "Gym / Styrka", icon: Dumbbell, transferFactor: 0.3, fields: ["durationMin", "rpe", "notes"] },
  { id: "crossfit", label: "Crossfit", icon: Dumbbell, transferFactor: 0.3, fields: ["durationMin", "rpe", "notes"] },
  { id: "climbing", label: "Klättring", icon: Mountain, transferFactor: 0.3, fields: ["durationMin", "rpe", "notes"] },
  { id: "yoga", label: "Yoga", icon: Flower2, transferFactor: 0.05, fields: ["durationMin", "rpe", "notes"] },
  { id: "mobility", label: "Rörlighet / stretch", icon: PersonStanding, transferFactor: 0.05, fields: ["durationMin", "notes"] },
  { id: "pilates", label: "Pilates", icon: PersonStanding, transferFactor: 0.05, fields: ["durationMin", "rpe", "notes"] },
  { id: "sup", label: "SUP / paddling", icon: Waves, transferFactor: 0.3, fields: distTime },
  { id: "skateski", label: "Rullskidor", icon: Bike, transferFactor: 0.7, fields: distTime },
  { id: "other", label: "Annan aktivitet", icon: Plus, transferFactor: 0.2, fields: ["durationMin", "rpe", "notes"] },
];

export function activityById(id?: string): ActivityDef | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}

/** Cross-training transfer factor for a given "Annat" activity id (default 0.2). */
export function transferFactorForActivity(id?: string): number {
  return activityById(id)?.transferFactor ?? 0.2;
}

/**
 * Transfer factor for any logged session. Real cycling session types transfer
 * fully (1.0); "Annat" activities use their per-activity factor.
 */
export function transferFactorForSession(
  sessionType: SessionType,
  activity?: string
): number {
  return sessionType === "other" ? transferFactorForActivity(activity) : 1.0;
}
