// Durability model: how large a fraction of FTP (the "intensity factor", IF)
// the rider can actually sustain for the ~9h / 315 km race.
//
// Why this exists: FTP is a ~1h ceiling. For a 315 km event, two riders with the
// same FTP finish very differently depending on their long-ride preparation
// ("durability"). Endurance-cycling practice and the fatigue/durability
// literature show that IF for a very long, well-fuelled effort rises with:
//   1) the LONGEST recent ride (the classic long-distance readiness signal), and
//   2) consistent recent endurance VOLUME.
//
// Anchor points (drafted, well-fuelled sub-9h effort):
//   - Little/no long-ride training: ~0.62-0.66 of FTP sustainable for 9h.
//   - Well-prepared long-distance rider: ~0.72-0.78 of FTP.
// We bound IF to [0.60, 0.78] and keep the mapping conservative and gradual so a
// single long ride can't max it out — reaching the top needs progressively
// longer rides AND consistent volume.

import type { LoggedSession, SessionType } from "./types";
import { addDays } from "./format";

const CYCLING_TYPES: SessionType[] = [
  "recovery",
  "endurance",
  "long",
  "cadence",
  "tempo",
  "threshold",
  "vo2",
  "intervals",
  "race",
];
const CYCLING_ACTIVITIES = new Set(["spinning", "mtb", "gravel", "gravel_bike"]);
// Aerobic "saddle time" that builds durability volume.
const ENDURANCE_TYPES: SessionType[] = [
  "endurance",
  "long",
  "recovery",
  "tempo",
  "threshold",
];

export const IF_MIN = 0.6; // hard floor
export const IF_BASE = 0.62; // conservative default with no long-ride data
export const IF_MAX = 0.78; // well-prepared long-distance rider (drafted, fuelled)

// A ~5.5h longest ride (or ~180-200 km) is treated as top durability readiness
// for a *drafted* 315 km event (you rarely need to have ridden the full 9h).
const TARGET_LONG_MIN = 330;
const KM_TO_MIN = 2.0; // ~30 km/h fallback when only distance is logged
const TARGET_WEEKLY_ENDURANCE_MIN = 300; // ~5h/week aerobic volume ≈ top
const WINDOW_DAYS = 56; // ~8 weeks

function isCyclingRide(l: LoggedSession): boolean {
  if (CYCLING_TYPES.includes(l.sessionType)) return true;
  return (
    l.sessionType === "other" &&
    !!l.activity &&
    CYCLING_ACTIVITIES.has(l.activity)
  );
}

export interface DurabilityModel {
  intensityFactor: number; // fraction of FTP sustainable for the race
  longestRideMin: number;
  longestRideKm: number;
  longRideScore: number; // 0..1 toward TARGET_LONG_MIN
  weeklyEnduranceHours: number;
  volumeScore: number; // 0..1 toward TARGET_WEEKLY_ENDURANCE_MIN
  combinedScore: number; // 0..1 overall durability readiness
  hasLongRides: boolean;
  level: "låg" | "medel" | "hög";
}

export function computeDurability(
  logged: LoggedSession[],
  asOf: string
): DurabilityModel {
  const start = addDays(asOf, -WINDOW_DAYS);
  let longestRideMin = 0;
  let longestRideKm = 0;
  let enduranceMin = 0;

  for (const l of logged) {
    if (l.date <= start || l.date > asOf) continue;
    if (!isCyclingRide(l)) continue;
    const dur = l.durationMin ?? 0;
    const km = l.distanceKm ?? 0;
    if (dur > longestRideMin) longestRideMin = dur;
    if (km > longestRideKm) longestRideKm = km;
    if (ENDURANCE_TYPES.includes(l.sessionType)) enduranceMin += dur;
  }

  const effLongMin = Math.max(longestRideMin, longestRideKm * KM_TO_MIN);
  const longRideScore = Math.min(1, effLongMin / TARGET_LONG_MIN);

  const weeklyEnduranceMin = enduranceMin / (WINDOW_DAYS / 7);
  const volumeScore = Math.min(1, weeklyEnduranceMin / TARGET_WEEKLY_ENDURANCE_MIN);

  // Long rides are the primary driver; consistent volume modulates the last bit.
  // A single long ride (volumeScore≈0) caps combined at ~0.70 of its long-ride
  // score, so it can raise IF but never reach the top without sustained volume.
  const combinedScore = longRideScore * (0.7 + 0.3 * volumeScore);

  let intensityFactor = IF_BASE + (IF_MAX - IF_BASE) * combinedScore;
  intensityFactor = Math.max(IF_MIN, Math.min(IF_MAX, intensityFactor));

  const level =
    intensityFactor >= 0.73 ? "hög" : intensityFactor >= 0.66 ? "medel" : "låg";

  return {
    intensityFactor,
    longestRideMin,
    longestRideKm,
    longRideScore,
    weeklyEnduranceHours: weeklyEnduranceMin / 60,
    volumeScore,
    combinedScore,
    hasLongRides: effLongMin >= 120, // at least a 2h ride counts as "long"
    level,
  };
}
