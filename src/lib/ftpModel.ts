// Smart FTP estimation from logged power data.
//
// Principles:
//  - A single session should barely move FTP; the big picture drives it.
//  - Evidence (power efforts) can only push FTP up in a damped way, capped to a
//    physiologically plausible ramp from the last known anchor.
//  - FTP decays over time if you stop training (detraining), toward a floor.
//  - A manual FTP test is a strong anchor that resets the evidence window.

import type { FtpTest, LoggedSession, SessionType } from "./types";
import { addDays, todayISO } from "./format";
import { transferFactorForSession } from "./logFields";

// Expected fraction of FTP sustainable for a *maximal* effort of a given length.
// Anchored to validated field tests: FTP ≈ 60-min power (frac 1.00), ≈ 95% of a
// maximal 20-min effort (frac 1.053) and ≈ 90% of a maximal 8-min effort
// (frac 1.11). Shorter durations are increasingly anaerobic and are NOT used to
// raise FTP (see MIN_FTP_EFFORT_MIN below); they are only listed for reference.
const FRAC: [number, number][] = [
  [1, 1.5],
  [2, 1.36],
  [3, 1.28],
  [5, 1.18],
  [8, 1.11],
  [10, 1.09],
  [12, 1.08],
  [20, 1.053],
  [30, 1.03],
  [40, 1.02],
  [60, 1.0],
  [90, 0.95],
  [120, 0.92],
  [180, 0.88],
];

// Minimum sustained duration (min) for an effort to be treated as FTP evidence.
// Below this the effort is dominated by anaerobic/VO2 capacity, not threshold.
export const MIN_FTP_EFFORT_MIN = 8;

export function fracOfFtp(durMin: number): number {
  if (durMin <= FRAC[0][0]) return FRAC[0][1];
  const last = FRAC[FRAC.length - 1];
  if (durMin >= last[0]) return last[1];
  for (let i = 0; i < FRAC.length - 1; i++) {
    const [d0, f0] = FRAC[i];
    const [d1, f1] = FRAC[i + 1];
    if (durMin >= d0 && durMin <= d1) {
      const t = (durMin - d0) / (d1 - d0);
      return f0 + (f1 - f0) * t;
    }
  }
  return 1;
}

const HARD_TYPES: SessionType[] = [
  "tempo",
  "threshold",
  "vo2",
  "intervals",
  "race",
];

interface Effort {
  power: number;
  durMin: number;
  rpe?: number;
  date: string;
  isInterval: boolean;
}

function collectEfforts(
  logged: LoggedSession[],
  afterDate: string,
  asOf: string
): Effort[] {
  const windowStart = addDays(asOf, -42);
  const efforts: Effort[] = [];
  for (const l of logged) {
    if (l.date <= afterDate || l.date > asOf) continue;
    if (l.date < windowStart) continue;
    // whole-session sustained effort (prefer NP)
    const p = l.normalizedWatts ?? l.avgWatts;
    if (p && l.durationMin && l.durationMin >= 8) {
      efforts.push({ power: p, durMin: l.durationMin, rpe: l.rpe, date: l.date, isInterval: false });
    }
    // interval blocks
    for (const iv of l.intervals ?? []) {
      if (iv.watts && iv.onMin) {
        // several reps at a power is stronger evidence than one -> lengthen a bit
        const effDur = iv.onMin * Math.min(iv.reps || 1, 3) ** 0.35;
        efforts.push({ power: iv.watts, durMin: effDur, rpe: l.rpe, date: l.date, isInterval: true });
      }
    }
  }
  return efforts;
}

function reliability(e: Effort): number {
  let r: number;
  if (e.rpe == null) r = 0.4;
  else if (e.rpe >= 9) r = 1.0;
  else if (e.rpe >= 7) r = 0.8;
  else if (e.rpe >= 5) r = 0.5;
  else r = 0.3;
  if (e.isInterval) r = Math.min(1, r + 0.1);
  return r;
}

function recency(dateISO: string, asOf: string): number {
  const ageDays =
    (new Date(asOf).getTime() - new Date(dateISO).getTime()) / 86400000;
  return Math.pow(0.5, Math.max(0, ageDays) / 28); // 4-week half-life
}

export interface ModeledFtp {
  ftp: number;
  anchorFtp: number;
  anchorDate: string;
  evidenceFtp: number; // best damped evidence before decay
  evidenceCount: number;
  decayFactor: number;
  decayApplied: boolean;
  daysSinceStimulus: number;
  hasManualAnchor: boolean;
  consistentWeeks: number; // recent weeks meeting a volume threshold
  volumeDriftPct: number; // upward drift from accumulated easy volume
}

export function modelFtp(
  ftps: FtpTest[],
  logged: LoggedSession[],
  fallbackFtp: number,
  asOf: string = todayISO()
): ModeledFtp {
  const tests = ftps
    .filter((t) => t.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Only real tests act as a hard anchor. Until then, the Settings baseline
  // (fallbackFtp) is the single source of truth for FTP, so editing it there
  // immediately changes your level.
  const manualTests = tests.filter((t) => t.source && t.source !== "estimate");
  const anchorTest = manualTests[manualTests.length - 1];
  const hasManualAnchor = manualTests.length > 0;
  const anchorFtp = anchorTest?.ftpWatts ?? fallbackFtp;
  const anchorDate =
    anchorTest?.date ?? tests[0]?.date ?? addDays(asOf, -400);

  const efforts = collectEfforts(logged, anchorDate, asOf);

  // Upward evidence: damped pull toward each effort's implied FTP. Only
  // sustained near-threshold efforts qualify; short maximal efforts (VO2/
  // anaerobic) are excluded because they don't reflect the aerobic threshold.
  let up = anchorFtp;
  let evidenceCount = 0;
  for (const e of efforts) {
    if (e.durMin < MIN_FTP_EFFORT_MIN) continue; // too short to reflect FTP
    const implied = e.power / fracOfFtp(e.durMin);
    if (implied <= anchorFtp * 0.6) continue; // clearly submaximal / noise
    evidenceCount++;
    const pull = anchorFtp + (implied - anchorFtp) * reliability(e) * recency(e.date, asOf);
    if (pull > up) up = pull;
  }

  // Consistency / volume drift: accumulated aerobic training (even easy) slowly
  // builds FTP over weeks, separate from any single hard effort. Bounded so pure
  // volume can only add a few % without corroborating power evidence.
  //
  // Each session's minutes are weighted by how much its training transfers to
  // cycling (specificity): cycling = full, running/rowing/ski partial, ball
  // sports little, yoga ~none. So consistent cross-training still builds a small
  // base, but clearly less than cycling. A full "credit" week is 150 weighted
  // min (2.5h); weeks contribute continuously so even modest cross-training adds
  // a nonzero amount.
  let effectiveWeeks = 0; // 0..8, continuous (weighted by transfer factor)
  for (let w = 0; w < 8; w++) {
    const wEnd = addDays(asOf, -7 * w);
    const wStart = addDays(wEnd, -7);
    const wmins = logged
      .filter((l) => l.date > wStart && l.date <= wEnd)
      .reduce(
        (sum, l) =>
          sum +
          (l.durationMin ?? 0) *
            transferFactorForSession(l.sessionType, l.activity),
        0
      );
    effectiveWeeks += Math.min(1, wmins / 150);
  }
  const consistentWeeks = Math.round(effectiveWeeks);
  // Easy aerobic volume builds threshold, but less than structured intensity, so
  // pure volume can add at most ~4% before harder efforts are needed to progress.
  const volumeDriftPct = Math.min(0.04, 0.005 * effectiveWeeks);
  const volumeUp = anchorFtp * (1 + volumeDriftPct);
  if (effectiveWeeks > 0 && volumeUp > up) up = volumeUp;

  // Cap the rise to research-based adaptation rates. A real test is trusted, so
  // FTP may only climb ~0.7%/week from it (≈2-5% per 8-12 week block for trained
  // riders), capped at +6% until you re-test. An unverified estimate is weak, so
  // a proper sustained test-effort is allowed to correct it quickly.
  const weeksSinceAnchor = Math.max(
    0,
    (new Date(asOf).getTime() - new Date(anchorDate).getTime()) / (7 * 86400000)
  );
  const riseCap = hasManualAnchor
    ? anchorFtp * Math.min(1.06, 1 + 0.007 * weeksSinceAnchor)
    : anchorFtp * 1.6;
  up = Math.min(up, riseCap);

  // Detraining decay based on time since last real training stimulus.
  const stimulusDates = logged
    .filter(
      (l) =>
        l.date <= asOf &&
        ((l.durationMin ?? 0) >= 30 || HARD_TYPES.includes(l.sessionType))
    )
    .map((l) => l.date);
  // A real FTP test is itself a known fitness point, so detraining is measured
  // from it too (a test followed by silence still decays). But with no test and
  // no logs at all we have no basis to infer detraining, so we don't decay
  // (avoids "FTP dropped" just because a new user hasn't started logging).
  if (hasManualAnchor) stimulusDates.push(anchorDate);
  stimulusDates.sort();
  const hasAnyStimulus = stimulusDates.length > 0;
  const lastStimulus = stimulusDates[stimulusDates.length - 1] ?? anchorDate;
  const daysSinceStimulus = hasAnyStimulus
    ? Math.max(
        0,
        Math.round((new Date(asOf).getTime() - new Date(lastStimulus).getTime()) / 86400000)
      )
    : 0;
  const graceDays = 12; // detraining becomes notable around weeks 2-3
  const effWeeks = Math.max(0, (daysSinceStimulus - graceDays) / 7);
  const decayFactor = hasAnyStimulus ? Math.pow(1 - 0.015, effWeeks) : 1; // ~1.5%/week after grace
  const floor = anchorFtp * 0.82;
  const modeled = Math.max(floor, up * decayFactor);

  return {
    ftp: Math.round(modeled),
    anchorFtp: Math.round(anchorFtp),
    anchorDate,
    evidenceFtp: Math.round(up),
    evidenceCount,
    decayFactor,
    decayApplied: decayFactor < 0.999,
    daysSinceStimulus,
    hasManualAnchor,
    consistentWeeks,
    volumeDriftPct: Math.round(volumeDriftPct * 100),
  };
}
