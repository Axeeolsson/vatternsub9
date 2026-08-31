// The adaptive engine. Pure functions: given the template + what has actually
// been logged + current FTP, decide what to do today and how the plan should
// flex around real behaviour and fitness.

import type {
  FtpTest,
  Intensity,
  IntervalBlock,
  LoggedSession,
  SessionType,
  Settings,
} from "./types";
import type { StoredPlannedSession } from "../db/db";
import planSeed from "../data/plan.seed";
import {
  estimateRace,
  requiredFtp,
  RACE_REFERENCE_IF,
  draftFactorForRiders,
} from "./powerModel";
import { wattsForZone, zonesForFtp } from "./zones";
import { addDays, todayISO } from "./format";
import { modelFtp, MIN_FTP_EFFORT_MIN } from "./ftpModel";
import { computeDurability } from "./durability";
import { transferFactorForSession } from "./logFields";
import { effectiveSettings } from "./settings";

export interface EngineState {
  planned: StoredPlannedSession[];
  logged: LoggedSession[];
  ftps: FtpTest[];
  settings: Settings;
}

export function intensityOf(t: SessionType): Intensity {
  switch (t) {
    case "rest":
      return "rest";
    case "recovery":
    case "cadence":
    case "strength":
      return "easy";
    case "long":
    case "endurance":
      return "moderate";
    default:
      return "hard";
  }
}

// Coarse category used when matching a logged session to a planned one.
function typeGroup(t: SessionType): string {
  switch (t) {
    case "rest":
      return "rest";
    case "recovery":
    case "cadence":
      return "easy";
    case "strength":
      return "strength";
    case "long":
    case "endurance":
      return "long";
    default:
      return "quality";
  }
}

/** Whether a logged session type reasonably corresponds to a planned type. */
export function sessionCorresponds(a: SessionType, b: SessionType): boolean {
  return a === b || typeGroup(a) === typeGroup(b);
}

/**
 * Strict, per-day completion check for the Schedule "Klar" badge.
 *
 * A specific planned session counts as done only if there is a logged session
 * that either explicitly satisfies it (`satisfiesPlannedId === planned.id`) or
 * was logged ON THE SAME DATE with a corresponding type. It deliberately does
 * NOT use the flexible week-wide type matching (`satisfiedIds`) so that logging
 * a same-type session on a different day, or an unrelated activity on a date,
 * does not mark this day done. The flexible reconciliation still drives the
 * daily recommendation.
 */
export function isPlannedCompleted(
  planned: StoredPlannedSession,
  logged: LoggedSession[]
): boolean {
  if (planned.sessionType === "rest") return false;
  return logged.some((l) => {
    if (l.sessionType === "rest") return false;
    if (l.satisfiesPlannedId === planned.id) return true;
    return (
      !l.satisfiesPlannedId &&
      l.date === planned.date &&
      sessionCorresponds(l.sessionType, planned.sessionType)
    );
  });
}

/** Non-rest sessions actually logged on a given date (for the Schedule view). */
export function loggedOnDate(
  logged: LoggedSession[],
  dateISO: string
): LoggedSession[] {
  return logged.filter((l) => l.date === dateISO && l.sessionType !== "rest");
}

export function weekOfDate(dateISO: string): number | null {
  for (const w of planSeed.weeks) {
    const end = addDays(w.startDateISO, 6);
    if (dateISO >= w.startDateISO && dateISO <= end) return w.week;
  }
  if (dateISO < planSeed.weeks[0].startDateISO) return 0; // before plan starts
  return null; // after plan / race
}

export function weekInfo(week: number) {
  return planSeed.weeks.find((w) => w.week === week);
}

// ---- Reconciliation ---------------------------------------------------------

export interface WeekReconciliation {
  week: number;
  planned: StoredPlannedSession[];
  /** planned id -> logged session that satisfied it */
  satisfiedBy: Map<string, LoggedSession>;
  satisfiedIds: Set<string>;
  remainingTraining: StoredPlannedSession[]; // unsatisfied, non-rest
  loggedThisWeek: LoggedSession[];
  restDaysPlanned: number;
  restObservedBefore: (todayISO: string) => number;
  trainingDatesDone: Set<string>;
}

export function reconcileWeek(
  state: EngineState,
  week: number
): WeekReconciliation {
  const planned = state.planned
    .filter((p) => p.week === week)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const wi = weekInfo(week);
  const weekStart = wi?.startDateISO ?? planned[0]?.date;
  const weekEnd = weekStart ? addDays(weekStart, 6) : "9999-12-31";

  const loggedThisWeek = state.logged
    .filter((l) => l.date >= (weekStart ?? "") && l.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  const satisfiedBy = new Map<string, LoggedSession>();
  const satisfiedIds = new Set<string>();

  const claim = (p: StoredPlannedSession, l: LoggedSession) => {
    satisfiedBy.set(p.id, l);
    satisfiedIds.add(p.id);
  };

  for (const l of loggedThisWeek) {
    if (l.sessionType === "rest") continue; // rest handled separately
    // 1) explicit link
    if (l.satisfiesPlannedId) {
      const target = planned.find(
        (p) => p.id === l.satisfiesPlannedId && !satisfiedIds.has(p.id)
      );
      if (target) {
        claim(target, l);
        continue;
      }
    }
    // 2) same exact type, earliest unsatisfied
    let target = planned.find(
      (p) =>
        !satisfiedIds.has(p.id) &&
        p.sessionType === l.sessionType &&
        p.sessionType !== "rest"
    );
    // 3) same coarse group
    if (!target) {
      const g = typeGroup(l.sessionType);
      target = planned.find(
        (p) =>
          !satisfiedIds.has(p.id) &&
          p.sessionType !== "rest" &&
          typeGroup(p.sessionType) === g
      );
    }
    if (target) claim(target, l);
  }

  const remainingTraining = planned.filter(
    (p) => p.sessionType !== "rest" && !satisfiedIds.has(p.id)
  );
  const restDaysPlanned = planned.filter(
    (p) => p.sessionType === "rest"
  ).length;

  const trainingDatesDone = new Set(
    loggedThisWeek.filter((l) => l.sessionType !== "rest").map((l) => l.date)
  );

  const restObservedBefore = (todayISO: string) => {
    if (!weekStart) return 0;
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (d >= todayISO) break;
      if (!trainingDatesDone.has(d)) count++;
    }
    return count;
  };

  return {
    week,
    planned,
    satisfiedBy,
    satisfiedIds,
    remainingTraining,
    loggedThisWeek,
    restDaysPlanned,
    restObservedBefore,
    trainingDatesDone,
  };
}

// ---- Level / on-track assessment -------------------------------------------

export type LevelStatus = "ahead" | "on_track" | "behind" | "unknown";

export interface LevelAssessment {
  ftp: number;
  weightKg: number;
  wattsPerKg: number;
  projectedFinishSeconds: number;
  goalSeconds: number;
  requiredFtp: number;
  requiredWattsPerKg: number;
  deltaSeconds: number; // projected - goal (neg = ahead)
  ratio: number; // ftp / requiredFtp
  status: LevelStatus;
  loadFactor: number; // unified multiplier the schedule applies
  adjustPct: number;
  // Progressive overload / form
  progressionFactor: number;
  formTrend: FormTrend;
  readiness: Readiness;
  progressionActive: boolean; // targets scaled UP from strong form
  progressionEased: boolean; // targets eased DOWN for recovery/low readiness
  progressionNote: string;
  buildWeek: boolean;
  avgSpeedKmh: number;
  preliminary: boolean; // true until a real (non-estimate) FTP test exists
  // FTP model detail
  ftpAnchor: number; // last known test/baseline
  ftpModeled: boolean; // FTP was moved by logged data
  ftpEvidenceCount: number;
  ftpDecayApplied: boolean;
  daysSinceStimulus: number;
  ftpVolumeWeeks: number;
  ftpVolumeDriftPct: number;
  // Durability model detail
  sustainableIF: number; // fraction of FTP held for the race (dynamic)
  referenceIF: number; // IF assumed in "required FTP"
  durabilityLevel: "låg" | "medel" | "hög";
  durabilityScore: number; // 0..1
  longestRideMin: number;
  longestRideKm: number;
  weeklyEnduranceHours: number;
  hasLongRides: boolean;
  // Group / draft
  groupSize: Settings["groupSize"];
  draftFactor: number;
  draftSavingPct: number; // aero saving vs solo, %
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export type FormTrend = "improving" | "flat" | "declining";
export type Readiness = "high" | "ok" | "low";

export interface Progression {
  buildWeek: boolean;
  formTrend: FormTrend;
  readiness: Readiness;
  progressionFactor: number; // >1 push, <1 ease, from form + readiness
  ftpDeltaPct: number;
  completionRate: number;
  avgHardRpe: number | null;
  eased: boolean;
  note: string;
}

/**
 * Progressive overload signal. When form is improving and the athlete is
 * recovering well (sessions feel easy, nothing missed) we scale training UP so
 * they keep developing instead of coasting — but bounded to a safe step
 * (<=~10%/week, the classic injury-risk ceiling from acute:chronic workload
 * research). Recovery weeks and taper/race weeks are NEVER overloaded. If
 * readiness is poor (rising RPE, missed key sessions, or FTP declining) we ease
 * off instead — safety first.
 */
export function computeProgression(
  state: EngineState,
  asOfISO: string,
  ratio: number
): Progression {
  const week = weekOfDate(asOfISO);
  const wi = week ? weekInfo(week) : undefined;
  const phase = (wi?.phase ?? "").toLowerCase();
  const isTaperOrRace =
    phase.includes("nedtrappning") ||
    phase.includes("racevecka") ||
    phase.includes("race");
  const buildWeek = !!wi && !wi.isRecovery && !isTaperOrRace;

  // FTP trend over ~3.5 weeks.
  const eff = effectiveSettings(state.settings);
  const ftpNow = modelFtp(state.ftps, state.logged, eff.currentFtp, asOfISO).ftp;
  const ftpPast = modelFtp(
    state.ftps,
    state.logged,
    eff.currentFtp,
    addDays(asOfISO, -24)
  ).ftp;
  const ftpDeltaPct = ftpPast > 0 ? (ftpNow - ftpPast) / ftpPast : 0;
  const formTrend: FormTrend =
    ftpDeltaPct >= 0.01 ? "improving" : ftpDeltaPct <= -0.01 ? "declining" : "flat";

  // Readiness from the last 14 days: completion rate + RPE.
  const winStart = addDays(asOfISO, -14);
  const recent = state.logged.filter(
    (l) => l.date > winStart && l.date <= asOfISO && l.sessionType !== "rest"
  );
  const plannedPast = state.planned.filter(
    (p) => p.sessionType !== "rest" && p.date > winStart && p.date < asOfISO
  );
  const completionRate = plannedPast.length
    ? Math.min(1, recent.length / plannedPast.length)
    : 1;
  const hardRpes = recent
    .filter((l) => intensityOf(l.sessionType) === "hard" && typeof l.rpe === "number")
    .map((l) => l.rpe as number);
  const avgHardRpe = hardRpes.length
    ? hardRpes.reduce((a, b) => a + b, 0) / hardRpes.length
    : null;
  const allRpes = recent
    .filter((l) => typeof l.rpe === "number")
    .map((l) => l.rpe as number);
  const avgRpe = allRpes.length ? allRpes.reduce((a, b) => a + b, 0) / allRpes.length : null;

  let readiness: Readiness;
  const rpeHigh = avgHardRpe != null && avgHardRpe >= 8;
  if (rpeHigh || completionRate < 0.6 || formTrend === "declining") readiness = "low";
  else if (
    completionRate >= 0.8 &&
    ((avgRpe != null && avgRpe <= 6.5) || (avgRpe == null && formTrend === "improving"))
  )
    readiness = "high";
  else readiness = "ok";

  let progressionFactor = 1;
  let eased = false;
  let note = "";
  if (!buildWeek) {
    note = wi?.isRecovery
      ? "Återhämtningsvecka – ingen uppskruvning."
      : "Nedtrappning/lopp – ingen uppskruvning.";
  } else if (readiness === "low") {
    progressionFactor = 0.92;
    eased = true;
    note =
      formTrend === "declining"
        ? "Formen viker / hög belastning – schemat nedskruvat för återhämtning."
        : "Hög ansträngning eller missade pass – lättare för att hämta dig.";
  } else {
    let push = 0;
    if (formTrend === "improving") push += 0.06;
    if (ratio > 1.02) push += 0.04; // room above the sub-9 requirement
    if (readiness === "high") push += 0.04;
    progressionFactor = 1 + Math.min(0.1, push); // cap +10%/step (injury-risk ceiling)
    note =
      progressionFactor > 1.01
        ? `Stark form – progressiv överbelastning (+${Math.round(
            (progressionFactor - 1) * 100
          )}%).`
        : "Stabilt – kör enligt plan.";
  }

  return {
    buildWeek,
    formTrend,
    readiness,
    progressionFactor,
    ftpDeltaPct,
    completionRate,
    avgHardRpe,
    eased,
    note,
  };
}

export function assessLevel(
  state: EngineState,
  asOfISO: string = todayISO()
): LevelAssessment {
  const eff = effectiveSettings(state.settings);
  const modeled = modelFtp(state.ftps, state.logged, eff.currentFtp, asOfISO);
  const ftp = modeled.ftp;
  // Settings weight is the source of truth for current weight.
  const weightKg = eff.weightKg;
  // Durability: endurance training raises the fraction of FTP held for 9h.
  const durability = computeDurability(state.logged, asOfISO);
  // Draft: more riders save more power (lower effective aero), saturating.
  const draftFactor = draftFactorForRiders(eff.groupSize);
  const est = estimateRace(
    ftp,
    weightKg,
    eff.bikeMassKg,
    durability.intensityFactor,
    draftFactor
  );
  // "Required FTP" is a stable target at a well-prepared reference IF, so it
  // doesn't drift as durability improves — you train FTP toward it. It DOES use
  // the current group size, since the draft you'll get is a race-day choice.
  const req = requiredFtp(
    eff.goalFinishSeconds,
    weightKg,
    eff.bikeMassKg,
    RACE_REFERENCE_IF,
    draftFactor
  );
  const ratio = ftp / req.ftp;
  const goalSeconds = eff.goalFinishSeconds;
  const deltaSeconds = est.finishSeconds - goalSeconds;

  let status: LevelStatus;
  if (est.finishSeconds <= goalSeconds) status = "ahead";
  else if (est.finishSeconds <= goalSeconds * 1.03) status = "on_track";
  else status = "behind";

  // Unify the goal-gap factor with the form-based progressive-overload
  // factor, with clear precedence: never overload recovery/taper weeks, and
  // ease off (ignoring any goal bump) when readiness is poor.
  const goalFactor =
    eff.autoAdjust && Math.abs(ratio - 1) > 0.03 ? clamp(ratio, 0.9, 1.2) : 1;
  const prog = computeProgression(state, asOfISO, ratio);
  let loadFactor = 1;
  if (eff.autoAdjust) {
    if (!prog.buildWeek) loadFactor = 1;
    else if (prog.eased) loadFactor = prog.progressionFactor;
    else loadFactor = clamp(goalFactor * prog.progressionFactor, 0.85, 1.25);
  }

  return {
    ftp,
    weightKg,
    wattsPerKg: ftp / weightKg,
    projectedFinishSeconds: est.finishSeconds,
    goalSeconds,
    requiredFtp: req.ftp,
    requiredWattsPerKg: req.wattsPerKg,
    deltaSeconds,
    ratio,
    status,
    loadFactor,
    adjustPct: Math.round((loadFactor - 1) * 100),
    progressionFactor: prog.progressionFactor,
    formTrend: prog.formTrend,
    readiness: prog.readiness,
    progressionActive: loadFactor > 1.01 && prog.buildWeek,
    progressionEased: loadFactor < 0.99 && prog.buildWeek,
    progressionNote: prog.note,
    buildWeek: prog.buildWeek,
    avgSpeedKmh: est.avgSpeedKmh,
    preliminary: !modeled.hasManualAnchor && modeled.evidenceCount === 0,
    ftpAnchor: modeled.anchorFtp,
    ftpModeled: modeled.ftp !== modeled.anchorFtp,
    ftpEvidenceCount: modeled.evidenceCount,
    ftpDecayApplied: modeled.decayApplied,
    daysSinceStimulus: modeled.daysSinceStimulus,
    ftpVolumeWeeks: modeled.consistentWeeks,
    ftpVolumeDriftPct: modeled.volumeDriftPct,
    sustainableIF: durability.intensityFactor,
    referenceIF: RACE_REFERENCE_IF,
    durabilityLevel: durability.level,
    durabilityScore: durability.combinedScore,
    longestRideMin: durability.longestRideMin,
    longestRideKm: durability.longestRideKm,
    weeklyEnduranceHours: durability.weeklyEnduranceHours,
    hasLongRides: durability.hasLongRides,
    groupSize: eff.groupSize,
    draftFactor,
    draftSavingPct: Math.round((1 - draftFactor) * 100),
  };
}

// ---- Per-session marginal impact -------------------------------------------

export interface SessionImpact {
  found: boolean;
  deltaFtp: number; // W (with − without this session)
  deltaFinishSeconds: number; // negative = faster
  deltaIF: number; // durability intensity factor
  deltaWattsPerKg: number;
  countedFtpEvidence: boolean;
  tags: string[]; // qualitative, Swedish
}

// Session types that build endurance/durability "saddle time".
const DURABILITY_TYPES: SessionType[] = [
  "long",
  "endurance",
  "recovery",
  "tempo",
  "threshold",
];

/** Structural eligibility to count as FTP evidence (mirrors ftpModel). */
function effortEligibleForFtp(l: LoggedSession): boolean {
  const p = l.normalizedWatts ?? l.avgWatts;
  if (p && (l.durationMin ?? 0) >= MIN_FTP_EFFORT_MIN) return true;
  for (const iv of l.intervals ?? []) {
    if (iv.watts && iv.onMin) {
      const effDur = iv.onMin * Math.pow(Math.min(iv.reps || 1, 3), 0.35);
      if (effDur >= MIN_FTP_EFFORT_MIN) return true;
    }
  }
  return false;
}

/**
 * Marginal effect of one logged session: compares the model WITH vs WITHOUT it.
 * Deterministic/pure. Tags mirror the same thresholds used in ftpModel/durability.
 */
export function sessionImpact(
  state: EngineState,
  sessionId: number
): SessionImpact {
  const zero: SessionImpact = {
    found: false,
    deltaFtp: 0,
    deltaFinishSeconds: 0,
    deltaIF: 0,
    deltaWattsPerKg: 0,
    countedFtpEvidence: false,
    tags: [],
  };
  const target = state.logged.find((l) => l.id === sessionId);
  if (!target) return zero;

  const withAll = assessLevel(state);
  const without = assessLevel({
    ...state,
    logged: state.logged.filter((l) => l.id !== sessionId),
  });

  const deltaFtp = withAll.ftp - without.ftp;
  const deltaFinishSeconds =
    withAll.projectedFinishSeconds - without.projectedFinishSeconds;
  const deltaIF = withAll.sustainableIF - without.sustainableIF;
  const deltaWattsPerKg = withAll.wattsPerKg - without.wattsPerKg;

  const eligible = effortEligibleForFtp(target);
  const isStimulus =
    (target.durationMin ?? 0) >= 30 || intensityOf(target.sessionType) === "hard";
  const contributesDurability =
    deltaIF > 0.0005 ||
    (DURABILITY_TYPES.includes(target.sessionType) && (target.durationMin ?? 0) > 0);

  const weightedVolMin =
    (target.durationMin ?? 0) *
    transferFactorForSession(target.sessionType, target.activity);
  const contributesVolume = weightedVolMin >= 10;
  const isCrossTraining = target.sessionType === "other";

  const tags: string[] = [];
  if (eligible && deltaFtp >= 1)
    tags.push("Räknades som FTP-bevis (nära-max ≥8 min)");
  else if (eligible)
    tags.push("Effektdata fanns men höjde inte FTP – låg under ditt tak");
  if (contributesDurability) tags.push("Bidrog till uthållighet (durability)");
  if (contributesVolume) tags.push("Räknades till veckans träningsvolym");
  if (isStimulus) tags.push("Motverkade detraining (träningsstimulans)");
  if (isCrossTraining) tags.push("Allmän kondition (cross-träning)");
  if (tags.length === 0)
    tags.push("För lugnt/kort för att höja nivån direkt – bygger bas");

  return {
    found: true,
    deltaFtp,
    deltaFinishSeconds,
    deltaIF,
    deltaWattsPerKg,
    countedFtpEvidence: eligible && deltaFtp >= 1,
    tags,
  };
}

// ---- Target scaling ---------------------------------------------------------

export interface ScaledInterval extends IntervalBlock {
  wattLo?: number;
  wattHi?: number;
}

export interface ScaledTargets {
  durationMin?: number;
  baseDurationMin?: number;
  zone?: string;
  zoneWattLo?: number;
  zoneWattHi?: number;
  intervals: ScaledInterval[];
  adjusted: boolean;
  progressionPct: number;
  eased: boolean;
  intensityNudged: boolean;
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

export function scaleTargets(
  session: StoredPlannedSession,
  ftp: number,
  loadFactor: number
): ScaledTargets {
  const scalable =
    session.sessionType === "long" ||
    session.sessionType === "endurance" ||
    session.sessionType === "recovery" ||
    session.sessionType === "tempo" ||
    session.sessionType === "threshold";
  const adjusted = scalable && Math.abs(loadFactor - 1) > 0.03;

  let durationMin = session.durationMin ?? undefined;
  if (adjusted && durationMin) {
    durationMin = roundTo(durationMin * loadFactor, 5);
  }

  const qualityType =
    session.sessionType === "threshold" ||
    session.sessionType === "tempo" ||
    session.sessionType === "vo2" ||
    session.sessionType === "intervals";
  // Modest intensity nudge on top of FTP-scaled watts when form is strong.
  const intensityNudged = loadFactor > 1.03 && qualityType;
  const nudge = (w?: number) =>
    w != null && intensityNudged ? Math.round(w * 1.03) : w;

  let zoneWattLo: number | undefined;
  let zoneWattHi: number | undefined;
  if (session.zone) {
    [zoneWattLo, zoneWattHi] = wattsForZone(ftp, session.zone);
    zoneWattLo = nudge(zoneWattLo);
    zoneWattHi = nudge(zoneWattHi);
  }

  const intervals: ScaledInterval[] = (session.intervals ?? []).map((iv) => {
    let reps = iv.reps;
    if (adjusted && loadFactor > 1.05 && intensityOf(session.sessionType) === "hard") {
      reps = Math.max(iv.reps, Math.round(iv.reps * loadFactor));
    }
    let wattLo: number | undefined;
    let wattHi: number | undefined;
    if (iv.zone) {
      [wattLo, wattHi] = wattsForZone(ftp, iv.zone);
      wattLo = nudge(wattLo);
      wattHi = nudge(wattHi);
    }
    return { ...iv, reps, wattLo, wattHi };
  });

  return {
    durationMin,
    baseDurationMin: session.durationMin ?? undefined,
    zone: session.zone ?? undefined,
    zoneWattLo,
    zoneWattHi,
    intervals,
    adjusted: adjusted || intensityNudged,
    progressionPct: Math.round((loadFactor - 1) * 100),
    eased: loadFactor < 0.97,
    intensityNudged,
  };
}

// ---- Daily recommendation ---------------------------------------------------

export type RecStatus =
  | "as_planned"
  | "already_done"
  | "pulled_forward"
  | "swapped_easy"
  | "extra_rest_to_training"
  | "catch_up"
  | "rest"
  | "before_plan"
  | "race_done"
  | "logged";

export interface Recommendation {
  date: string;
  week: number | null;
  plannedToday?: StoredPlannedSession;
  recommended?: StoredPlannedSession;
  status: RecStatus;
  reason: string;
  isRest: boolean;
  loggedToday: LoggedSession[];
  targets?: ScaledTargets;
  weekDone: number;
  weekTotal: number;
  weekly?: WeeklyAdaptation;
}

// ---- Cross-week adaptation --------------------------------------------------

export interface WeeklyAdaptation {
  currentWeek: number;
  prevWeek: number;
  prevPlanned: number;
  prevDone: number;
  prevCompletionPct: number; // 0..100
  severity: "none" | "minor" | "major";
  missedImportant?: StoredPlannedSession; // most important missed session
  message: string;
}

function importanceOf(t: SessionType): number {
  switch (typeGroup(t)) {
    case "quality":
      return 4;
    case "long":
      return 3;
    case "strength":
      return 2;
    case "easy":
      return 1;
    default:
      return 0;
  }
}

/**
 * Looks at how much of the PREVIOUS week was completed and adapts the current
 * week accordingly. This is the cross-week counterpart to the within-week
 * carry-forward logic: if you under-filled last week, the most important missed
 * session is surfaced as a catch-up and the guidance changes. Intensity itself
 * is already adapted separately via the FTP model (detraining lowers FTP, which
 * lowers `loadFactor`), so here we focus on structure + guidance.
 */
export function weeklyAdaptation(
  state: EngineState,
  asOfISO: string = todayISO()
): WeeklyAdaptation | undefined {
  const week = weekOfDate(asOfISO);
  if (!week || week <= 1) return undefined; // no in-plan previous week
  const prevWeek = week - 1;
  const prevRec = reconcileWeek(state, prevWeek);
  const prevPlanned = prevRec.planned.filter(
    (p) => p.sessionType !== "rest"
  ).length;
  if (prevPlanned === 0) return undefined;
  const prevDone = prevPlanned - prevRec.remainingTraining.length;
  const pct = Math.round((prevDone / prevPlanned) * 100);

  const missedImportant = [...prevRec.remainingTraining].sort(
    (a, b) => importanceOf(b.sessionType) - importanceOf(a.sessionType)
  )[0];

  let severity: WeeklyAdaptation["severity"];
  if (pct >= 85) severity = "none";
  else if (pct >= 60) severity = "minor";
  else severity = "major";

  let message: string;
  if (severity === "none") {
    message = `Förra veckan: ${pct}% avklarad – snyggt. Kör vidare enligt plan.`;
  } else if (severity === "minor") {
    const t = missedImportant?.title ?? "ditt nyckelpass";
    message = `Förra veckan blev ${pct}% avklarad. Ta igen ditt viktigaste missade pass (${t}) tidigt denna vecka – hoppa hellre över ett lätt pass än ett nyckelpass.`;
  } else {
    message = `Förra veckan blev bara ${pct}% avklarad. Kör inte ikapp allt – prioritera nyckelpassen (långpass + tröskel). Din nivå/FTP justeras automatiskt så intensiteten passar där du är nu.`;
  }

  return {
    currentWeek: week,
    prevWeek,
    prevPlanned,
    prevDone,
    prevCompletionPct: pct,
    severity,
    missedImportant,
    message,
  };
}

export function recommendForDate(
  state: EngineState,
  todayISO: string
): Recommendation {
  const week = weekOfDate(todayISO);
  const loggedToday = state.logged.filter((l) => l.date === todayISO);
  const level = assessLevel(state);
  const ftp = level.ftp;
  const weekly = weeklyAdaptation(state, todayISO);

  const base = (over: Partial<Recommendation>): Recommendation => ({
    date: todayISO,
    week,
    status: "rest",
    reason: "",
    isRest: true,
    loggedToday,
    weekDone: 0,
    weekTotal: 0,
    weekly,
    ...over,
  });

  if (week === 0)
    return base({
      status: "before_plan",
      reason: "Planen startar 24 aug 2026. Kör lugnt och håll igång tills dess.",
      isRest: true,
    });
  if (week === null)
    return base({
      status: "race_done",
      reason: "Utanför planens datum. Heja – kör loppet!",
      isRest: true,
    });

  const rec = reconcileWeek(state, week);
  const weekTotal = rec.planned.filter((p) => p.sessionType !== "rest").length;
  const weekDone = weekTotal - rec.remainingTraining.length;

  const plannedToday = rec.planned.find((p) => p.date === todayISO);

  // If something is already logged today, reflect that.
  if (loggedToday.length > 0) {
    return base({
      status: "logged",
      reason: "Du har redan loggat ett pass idag. Bra jobbat!",
      isRest: false,
      plannedToday,
      recommended: plannedToday,
      weekDone,
      weekTotal,
      targets: plannedToday
        ? scaleTargets(plannedToday, ftp, level.loadFactor)
        : undefined,
    });
  }

  const yesterday = addDays(todayISO, -1);
  const yesterdayHard = state.logged.some(
    (l) => l.date === yesterday && intensityOf(l.sessionType) === "hard"
  );

  // Helper: choose the next unsatisfied training session to pull forward.
  const pickCarry = (avoidHard: boolean): StoredPlannedSession | undefined => {
    const pool = [...rec.remainingTraining].sort((a, b) => {
      // preserve original order, but push hard sessions later if we must avoid them
      if (avoidHard) {
        const ah = intensityOf(a.sessionType) === "hard" ? 1 : 0;
        const bh = intensityOf(b.sessionType) === "hard" ? 1 : 0;
        if (ah !== bh) return ah - bh;
      }
      return a.dayOfWeek - b.dayOfWeek;
    });
    return pool[0];
  };

  // Cross-week catch-up: only once this week's own work allows it, and only for
  // an important (long/quality) session missed last week. Capped to one, never
  // stacked on top of a hard day.
  const catchUp: StoredPlannedSession | undefined = (() => {
    if (!weekly || weekly.severity === "none" || !weekly.missedImportant)
      return undefined;
    const s = weekly.missedImportant;
    if (importanceOf(s.sessionType) < 3) return undefined;
    if (intensityOf(s.sessionType) === "hard" && yesterdayHard) return undefined;
    return s;
  })();
  const catchUpReason = weekly
    ? `Extrapass för att ta igen förra veckan (${weekly.prevCompletionPct}% avklarad). Här är ditt viktigaste missade pass.`
    : "";

  // Case A: today is a planned rest day.
  if (plannedToday && plannedToday.sessionType === "rest") {
    const restObserved = rec.restObservedBefore(todayISO);
    const needMoreRest = restObserved < effectiveSettings(state.settings).restDaysPerWeek;
    if (needMoreRest || rec.remainingTraining.length === 0) {
      return base({
        status: "rest",
        reason:
          rec.remainingTraining.length === 0
            ? "Veckans pass är avklarade. Vila och ladda."
            : "Planerad vilodag. Återhämtning är en del av träningen.",
        isRest: true,
        plannedToday,
        weekDone,
        weekTotal,
      });
    }
    // Enough rest already taken this week -> convert to training.
    const carry = pickCarry(yesterdayHard);
    if (carry) {
      return base({
        status: "extra_rest_to_training",
        reason: `Du har redan vilat ${restObserved} dag(ar) denna vecka. Passar bra att ta ett kvarvarande pass istället.`,
        isRest: false,
        plannedToday,
        recommended: carry,
        weekDone,
        weekTotal,
        targets: scaleTargets(carry, ftp, level.loadFactor),
      });
    }
    if (catchUp) {
      return base({
        status: "catch_up",
        reason: catchUpReason,
        isRest: false,
        plannedToday,
        recommended: catchUp,
        weekDone,
        weekTotal,
        targets: scaleTargets(catchUp, ftp, level.loadFactor),
      });
    }
  }

  // Case B: today has a planned training session.
  if (plannedToday && plannedToday.sessionType !== "rest") {
    const alreadyDone = rec.satisfiedIds.has(plannedToday.id);
    if (!alreadyDone) {
      // hard-after-hard guard
      if (
        intensityOf(plannedToday.sessionType) === "hard" &&
        yesterdayHard
      ) {
        const easier = rec.remainingTraining.find(
          (p) => p.id !== plannedToday.id && intensityOf(p.sessionType) !== "hard"
        );
        if (easier) {
          return base({
            status: "swapped_easy",
            reason:
              "Igår var ett hårt pass. Byt till ett lättare pass idag och flytta det hårda framåt för bättre återhämtning.",
            isRest: false,
            plannedToday,
            recommended: easier,
            weekDone,
            weekTotal,
            targets: scaleTargets(easier, ftp, level.loadFactor),
          });
        }
      }
      return base({
        status: "as_planned",
        reason:
          level.status === "ahead" && level.adjustPct > 0
            ? `Din nivå ligger före schemat – målen är uppjusterade ca +${level.adjustPct}%.`
            : "Dagens pass enligt schemat.",
        isRest: false,
        plannedToday,
        recommended: plannedToday,
        weekDone,
        weekTotal,
        targets: scaleTargets(plannedToday, ftp, level.loadFactor),
      });
    }
    // Already did this session earlier -> pull forward next, or rest.
    const carry = pickCarry(yesterdayHard);
    if (carry) {
      return base({
        status: "pulled_forward",
        reason:
          "Dagens planerade pass är redan avklarat tidigare i veckan. Här är nästa pass som återstår.",
        isRest: false,
        plannedToday,
        recommended: carry,
        weekDone,
        weekTotal,
        targets: scaleTargets(carry, ftp, level.loadFactor),
      });
    }
    if (catchUp) {
      return base({
        status: "catch_up",
        reason: catchUpReason,
        isRest: false,
        plannedToday,
        recommended: catchUp,
        weekDone,
        weekTotal,
        targets: scaleTargets(catchUp, ftp, level.loadFactor),
      });
    }
    return base({
      status: "rest",
      reason: "Allt planerat är gjort. Ta en välförtjänt vila.",
      isRest: true,
      plannedToday,
      weekDone,
      weekTotal,
    });
  }

  // Case C: no planned session today (shouldn't happen, plan covers all days).
  const carry = pickCarry(yesterdayHard);
  if (carry) {
    return base({
      status: "pulled_forward",
      reason: "Inget pass planerat idag, men det finns pass kvar i veckan.",
      isRest: false,
      recommended: carry,
      weekDone,
      weekTotal,
      targets: scaleTargets(carry, ftp, level.loadFactor),
    });
  }
  if (catchUp) {
    return base({
      status: "catch_up",
      reason: catchUpReason,
      isRest: false,
      recommended: catchUp,
      weekDone,
      weekTotal,
      targets: scaleTargets(catchUp, ftp, level.loadFactor),
    });
  }
  return base({
    status: "rest",
    reason: "Inget planerat idag. Vila eller kör ett lugnt pass om du vill.",
    isRest: true,
    weekDone,
    weekTotal,
  });
}

// ---- Aggregate progress -----------------------------------------------------

export interface PlanProgress {
  totalSessions: number;
  doneSessions: number;
  totalWeeks: number;
  currentWeek: number | null;
  phase?: string;
  weekType?: string;
}

export function planProgress(
  state: EngineState,
  todayISO: string
): PlanProgress {
  const total = state.planned.filter((p) => p.sessionType !== "rest").length;
  // count logged non-rest that map to a planned week/type
  let done = 0;
  const byWeek = new Map<number, WeekReconciliation>();
  for (const w of planSeed.weeks) {
    const r = reconcileWeek(state, w.week);
    byWeek.set(w.week, r);
    const wt = r.planned.filter((p) => p.sessionType !== "rest").length;
    done += wt - r.remainingTraining.length;
  }
  const week = weekOfDate(todayISO);
  const wi = week ? weekInfo(week) : undefined;
  return {
    totalSessions: total,
    doneSessions: done,
    totalWeeks: planSeed.weeks.length,
    currentWeek: week,
    phase: wi?.phaseShort,
    weekType: wi?.weekType,
  };
}

export const engineHelpers = { zonesForFtp };
