// Simple steady-state cycling power model used to translate FTP <-> finish time
// for Vätternrundan (~315 km, mostly flat, ridden in a drafting group).

export const DISTANCE_KM = 315;

export const PHYS = {
  g: 9.81,
  rho: 1.225, // air density kg/m^3
  crr: 0.005, // rolling resistance (good road tyres)
  cda: 0.32, // solo aero drag area m^2 (hoods)
  drivetrain: 0.97, // efficiency
  draftFactor: 0.7, // group riding cuts effective aero to ~70%
  // Fallback intensity factor for a ~9h endurance effort (fraction of FTP) when
  // no durability model is supplied. The live projection uses a dynamic IF from
  // the durability model instead (see src/lib/durability.ts).
  enduranceIF: 0.7,
};

// Reference IF used for "FTP required to hit the goal". This is deliberately the
// IF of a *well-prepared* long-distance rider (not the athlete's current, still-
// improving durability), so "required FTP" stays a stable target you train
// toward rather than a moving number that changes with every long ride.
export const RACE_REFERENCE_IF = 0.72;

// Drafting reduces effective aero drag (CdA). The saving grows with the number
// of riders and saturates for large groups (field/wind-tunnel data on paceline
// drafting: a rider sitting in saves ~15% behind one wheel, rising to ~35-40% in
// a big, well-organised paceline/peloton, with diminishing returns beyond ~15-20).
// We interpolate a monotonically decreasing, saturating CdA multiplier between
// these anchor points and clamp outside the range.
const DRAFT_ANCHORS: [number, number][] = [
  [1, 1.0],
  [2, 0.85],
  [4, 0.78],
  [6, 0.73],
  [9, 0.7],
  [12, 0.66],
  [15, 0.64],
  [20, 0.61],
  [30, 0.6],
];

/** Continuous CdA multiplier as a function of the exact number of riders. */
export function draftFactorForRiders(riders: number): number {
  const n = Number.isFinite(riders) ? riders : 1;
  if (n <= DRAFT_ANCHORS[0][0]) return DRAFT_ANCHORS[0][1]; // solo, no draft
  const last = DRAFT_ANCHORS[DRAFT_ANCHORS.length - 1];
  if (n >= last[0]) return last[1]; // saturated
  for (let i = 0; i < DRAFT_ANCHORS.length - 1; i++) {
    const [n0, f0] = DRAFT_ANCHORS[i];
    const [n1, f1] = DRAFT_ANCHORS[i + 1];
    if (n >= n0 && n <= n1) {
      const t = (n - n0) / (n1 - n0);
      return f0 + (f1 - f0) * t;
    }
  }
  return last[1];
}

/** Steady-state power (W) needed to hold a speed on flat ground. */
export function powerForSpeed(
  speedKmh: number,
  totalMassKg: number,
  cda: number = PHYS.cda * PHYS.draftFactor
): number {
  const v = speedKmh / 3.6;
  const rolling = PHYS.crr * totalMassKg * PHYS.g * v;
  const aero = 0.5 * PHYS.rho * cda * v * v * v;
  return (rolling + aero) / PHYS.drivetrain;
}

/** Invert the model: speed (km/h) achievable at a given sustained power. */
export function speedForPower(
  watts: number,
  totalMassKg: number,
  cda: number = PHYS.cda * PHYS.draftFactor
): number {
  let lo = 0;
  let hi = 90; // km/h upper bound
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (powerForSpeed(mid, totalMassKg, cda) > watts) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface RaceEstimate {
  sustainablePower: number;
  avgSpeedKmh: number;
  finishSeconds: number;
}

/** Projected race result from current FTP + rider/bike weight + draft. */
export function estimateRace(
  ftp: number,
  riderKg: number,
  bikeKg: number,
  intensityFactor: number = PHYS.enduranceIF,
  draftFactor: number = PHYS.draftFactor
): RaceEstimate {
  const total = riderKg + bikeKg;
  const cda = PHYS.cda * draftFactor;
  const sustainablePower = ftp * intensityFactor;
  const avgSpeedKmh = speedForPower(sustainablePower, total, cda);
  const finishSeconds = (DISTANCE_KM / avgSpeedKmh) * 3600;
  return { sustainablePower, avgSpeedKmh, finishSeconds };
}

/** FTP (and w/kg) required to hit a goal finish time at a given draft level. */
export function requiredFtp(
  goalSeconds: number,
  riderKg: number,
  bikeKg: number,
  intensityFactor: number = PHYS.enduranceIF,
  draftFactor: number = PHYS.draftFactor
): { ftp: number; wattsPerKg: number; avgSpeedKmh: number } {
  const total = riderKg + bikeKg;
  const cda = PHYS.cda * draftFactor;
  const goalHours = goalSeconds / 3600;
  const avgSpeedKmh = DISTANCE_KM / goalHours;
  const power = powerForSpeed(avgSpeedKmh, total, cda);
  const ftp = power / intensityFactor;
  return { ftp: Math.round(ftp), wattsPerKg: ftp / riderKg, avgSpeedKmh };
}
