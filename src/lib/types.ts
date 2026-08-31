// Shared domain types for the Vätternrundan sub-9h training app.

export type SessionType =
  | "rest"
  | "recovery"
  | "strength"
  | "cadence"
  | "tempo"
  | "threshold" // FTP / sweet-spot work
  | "vo2"
  | "long" // long endurance Z2
  | "endurance"
  | "intervals"
  | "race"
  | "other";

export type Zone = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";

export type Intensity = "rest" | "easy" | "moderate" | "hard";

export interface IntervalBlock {
  reps: number;
  onMin: number;
  offMin?: number;
  zone?: Zone;
  cadenceRpm?: [number, number];
  effortPct?: number; // subjective/target effort as % of FTP or max
  watts?: number; // measured avg watts during the interval
  label?: string;
}

export interface PlannedSession {
  id: string; // stable, e.g. "w1-d4"
  week: number; // 1..43
  dayOfWeek: number; // 1=Mon .. 7=Sun
  date: string; // ISO yyyy-mm-dd
  title: string;
  sessionType: SessionType;
  durationMin?: number;
  zone?: Zone;
  intervals: IntervalBlock[];
  intensity: Intensity;
  detail: string; // original Swedish text
}

export interface WeekPlan {
  week: number;
  dateRange: string; // "24/8 - 30/8"
  startDateISO: string;
  phase: string; // "Fas 1 - Grundbas"
  phaseShort: string; // "Grundbas"
  weekType: string; // "Byggvecka 1 av 3"
  isRecovery: boolean;
  sessions: PlannedSession[];
}

export interface PlanSeed {
  raceDateISO: string;
  startDateISO: string;
  weeks: WeekPlan[];
}

// ---- Logged / user data (stored in IndexedDB) ----

export interface LoggedSession {
  id?: number;
  date: string; // ISO yyyy-mm-dd
  sessionType: SessionType;
  activity?: string; // when sessionType === "other": e.g. "running", "tennis"
  title: string;
  durationMin?: number;
  avgSpeedKmh?: number;
  avgWatts?: number;
  normalizedWatts?: number;
  avgHr?: number;
  rpe?: number; // 1..10
  distanceKm?: number;
  intervals?: IntervalBlock[];
  metrics?: Record<string, number>; // extra activity-specific numbers
  notes?: string;
  satisfiesPlannedId?: string; // which planned session this fulfilled
  completedAt: number; // epoch ms
  // Cloud-sync metadata (optional; backfilled by a Dexie migration).
  syncId?: string; // stable UUID shared across devices
  updatedAt?: number; // epoch ms of last local edit (for last-write-wins)
}

export interface FtpTest {
  id?: number;
  date: string; // ISO
  ftpWatts: number;
  weightKg?: number;
  source?: "ramp" | "20min" | "8min" | "estimate" | "manual";
  notes?: string;
  syncId?: string;
  updatedAt?: number;
}

// Legacy coarse buckets kept only for migrating old local data (see repository).
export type LegacyGroupSize = "solo" | "small" | "medium" | "large" | "xlarge";

export interface Settings {
  id: "singleton";
  weightKg: number;
  currentFtp: number;
  goalFinishSeconds: number; // sub-9h => 9*3600
  restDaysPerWeek: number;
  bikeMassKg: number;
  autoAdjust: boolean;
  groupSize: number; // exact number of riders in the group/paceline (1 = solo)
  updatedAt?: number; // epoch ms of last local edit (for cloud last-write-wins)
}
