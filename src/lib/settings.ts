import type { Settings } from "./types";

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
} as const;

export interface EffectiveSettings {
  weightKg: number;
  bikeMassKg: number;
  currentFtp: number;
  goalFinishSeconds: number;
  restDaysPerWeek: number;
  groupSize: number;
  autoAdjust: boolean;
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
    autoAdjust: s?.autoAdjust ?? FALLBACKS.autoAdjust,
  };
}

/** True when the core profile inputs a user should fill are still unset. */
export function profileIncomplete(s?: Partial<Settings> | null): boolean {
  const posSet = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
  return !posSet(s?.weightKg) || !posSet(s?.currentFtp);
}
