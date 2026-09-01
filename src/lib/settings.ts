import type { Settings } from "./types";
import planSeed from "../data/plan.seed";

// Internal fallbacks used ONLY for computation when a profile value is unset.
// The stored Settings may leave these empty (a fresh account shows blank inputs
// with placeholders); the engine must never see NaN/undefined, so it reads
// through effectiveSettings() which fills any gaps with these safe defaults.
export const FALLBACKS = {
  weightKg: 78,
  bikeMassKg: 9,
  currentFtp: 220,
  goalFinishSeconds: 9 * 3600,
  restDaysPerWeek: 1,
  groupSize: 8,
  autoAdjust: true,
  planStartDate: planSeed.startDateISO,
} as const;

export interface EffectiveSettings {
  weightKg: number;
  bikeMassKg: number;
  currentFtp: number;
  goalFinishSeconds: number;
  restDaysPerWeek: number;
  groupSize: number;
  autoAdjust: boolean;
  planStartDate: string;
}

function posOr(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fb;
}
function nonNegOr(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fb;
}

/** Fill any unset profile values with safe fallbacks, for computation only. */
export function effectiveSettings(s?: Partial<Settings> | null): EffectiveSettings {
  return {
    weightKg: posOr(s?.weightKg, FALLBACKS.weightKg),
    bikeMassKg: posOr(s?.bikeMassKg, FALLBACKS.bikeMassKg),
    currentFtp: posOr(s?.currentFtp, FALLBACKS.currentFtp),
    goalFinishSeconds: posOr(s?.goalFinishSeconds, FALLBACKS.goalFinishSeconds),
    restDaysPerWeek: nonNegOr(s?.restDaysPerWeek, FALLBACKS.restDaysPerWeek),
    groupSize: posOr(s?.groupSize, FALLBACKS.groupSize),
    // Adaptation is mandatory: FTP, durability, RPE, completion and progressive
    // overload always shape the live plan.
    autoAdjust: true,
    planStartDate:
      typeof s?.planStartDate === "string" && s.planStartDate
        ? s.planStartDate
        : FALLBACKS.planStartDate,
  };
}

/** True when the core profile inputs a user should fill are still unset. */
export function profileIncomplete(s?: Partial<Settings> | null): boolean {
  return s?.profileCompleted !== true;
}
