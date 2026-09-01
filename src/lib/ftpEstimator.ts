import { fracOfFtp } from "./ftpModel";

export type CyclingExperience = "new" | "casual" | "regular" | "experienced";
export type WeeklyHours = "under1" | "1to3" | "3to5" | "5to8" | "over8";
export type WeeklySessions = "under2" | "2" | "3" | "4" | "over4";
export type LongestRide = "under45" | "45to90" | "90to180" | "over180";
export type QualitySessions = "0" | "1" | "2plus";

export interface QuestionnaireEstimate {
  weightKg: number;
  experience: CyclingExperience;
  weeklyHours: WeeklyHours;
  weeklySessions: WeeklySessions;
  longestRide: LongestRide;
  qualitySessions: QualitySessions;
}

export interface FtpEstimate {
  ftp: number;
  low: number;
  high: number;
  confidence: "låg" | "medel";
}

const EXPERIENCE_WKG: Record<CyclingExperience, number> = {
  new: 1.45,
  casual: 1.8,
  regular: 2.25,
  experienced: 2.65,
};
const HOURS_ADJUSTMENT: Record<WeeklyHours, number> = {
  under1: -0.15,
  "1to3": 0,
  "3to5": 0.18,
  "5to8": 0.35,
  over8: 0.52,
};
const FREQUENCY_ADJUSTMENT: Record<WeeklySessions, number> = {
  under2: -0.1,
  "2": 0,
  "3": 0.08,
  "4": 0.16,
  over4: 0.24,
};
const LONG_RIDE_ADJUSTMENT: Record<LongestRide, number> = {
  under45: -0.08,
  "45to90": 0,
  "90to180": 0.08,
  over180: 0.14,
};
const QUALITY_ADJUSTMENT: Record<QualitySessions, number> = {
  "0": 0,
  "1": 0.12,
  "2plus": 0.2,
};

function roundFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function validFtp(value: number): number {
  return Math.max(80, Math.min(600, value));
}

/**
 * Conservative onboarding estimate when no power data exists.
 *
 * This is intentionally a broad population-based starting point, not a
 * physiological FTP test. Recent cycling volume, frequency, experience and
 * specificity adjust a W/kg baseline; the result carries a ±15% interval.
 */
export function estimateFtpFromQuestionnaire(
  input: QuestionnaireEstimate
): FtpEstimate {
  const wkg = Math.max(
    1.2,
    Math.min(
      4.2,
      EXPERIENCE_WKG[input.experience] +
        HOURS_ADJUSTMENT[input.weeklyHours] +
        FREQUENCY_ADJUSTMENT[input.weeklySessions] +
        LONG_RIDE_ADJUSTMENT[input.longestRide] +
        QUALITY_ADJUSTMENT[input.qualitySessions]
    )
  );
  const ftp = validFtp(roundFive(wkg * input.weightKg));
  return {
    ftp,
    low: validFtp(roundFive(ftp * 0.85)),
    high: validFtp(roundFive(ftp * 1.15)),
    confidence: "låg",
  };
}

/**
 * Estimate from a recent maximal, evenly paced power effort. The duration
 * curve shares the app's FTP evidence model (20 min ≈ 105.3% FTP, i.e. ×0.95).
 */
export function estimateFtpFromPowerEffort(
  averageWatts: number,
  durationMin: number
): FtpEstimate {
  const ftp = validFtp(Math.round(averageWatts / fracOfFtp(durationMin)));
  const uncertainty = durationMin >= 40 ? 0.05 : durationMin >= 20 ? 0.07 : 0.12;
  return {
    ftp,
    low: validFtp(roundFive(ftp * (1 - uncertainty))),
    high: validFtp(roundFive(ftp * (1 + uncertainty))),
    confidence: "medel",
  };
}
