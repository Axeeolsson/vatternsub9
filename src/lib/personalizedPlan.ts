import planSeed from "../data/plan.seed";
import type { PlanSeed, PlannedSession, Settings, WeekPlan } from "./types";
import { addDays, parseISO } from "./format";

function dateRange(start: string, end: string): string {
  const a = parseISO(start);
  const b = parseISO(end);
  return `${a.getDate()}/${a.getMonth() + 1} - ${b.getDate()}/${b.getMonth() + 1}`;
}

export function isoWeekday(dateISO: string): number {
  const day = parseISO(dateISO).getDay();
  return day === 0 ? 7 : day;
}

export interface PersonalizedWeekRange {
  start: string;
  end: string;
}

/** Calendar blocks touched from start through race: first/last may be partial. */
export function calendarWeekRanges(
  start: string,
  race: string
): PersonalizedWeekRange[] {
  if (start > race) return [];
  const ranges: PersonalizedWeekRange[] = [];
  let currentStart = start;
  while (currentStart <= race) {
    const daysToSunday = 7 - isoWeekday(currentStart);
    const sunday = addDays(currentStart, daysToSunday);
    const end = sunday > race ? race : sunday;
    ranges.push({ start: currentStart, end });
    currentStart = addDays(end, 1);
  }
  return ranges;
}

/**
 * Generate a personalized copy of the immutable 43-week seed.
 *
 * If less time remains, early base weeks are removed first while the later
 * Build, taper and race phases are preserved. Source session IDs stay stable
 * (`wN-dN`), so logged `satisfiesPlannedId` links survive a start-date change.
 * Weeks are calendar weeks (Mon–Sun). Week 1 begins exactly on the selected
 * date and ends on the first Sunday; the final week ends on race Friday.
 */
export function buildPersonalizedPlan(
  planStartDate: string,
  seed: PlanSeed = planSeed
): PlanSeed {
  const race = seed.raceDateISO;
  const start = planStartDate || seed.startDateISO;
  if (start > race) {
    return { ...seed, startDateISO: start, weeks: [] };
  }

  const ranges = calendarWeekRanges(start, race);
  const weekCount = Math.min(seed.weeks.length, ranges.length);
  // Taking the final N template weeks preserves Build/taper/race and trims the
  // earliest general-base weeks when the athlete starts late.
  const selected = seed.weeks.slice(seed.weeks.length - weekCount);
  const raceFallback: PlannedSession[] = [
    {
      id: "w43-d1",
      week: 43,
      dayOfWeek: 1,
      date: addDays(race, -4),
      title: "Lätt återhämtning",
      sessionType: "recovery",
      durationMin: 45,
      zone: "Z1",
      intervals: [],
      intensity: "easy",
      detail: "45 min mycket lugnt. Fokus på återhämtning.",
    },
    {
      id: "w43-d2",
      week: 43,
      dayOfWeek: 2,
      date: addDays(race, -3),
      title: "Aktivering",
      sessionType: "cadence",
      durationMin: 40,
      intervals: [],
      intensity: "easy",
      detail: "Kort aktivering med några lätta fartökningar. Ingen trötthet.",
    },
    {
      id: "w43-d3",
      week: 43,
      dayOfWeek: 3,
      date: addDays(race, -2),
      title: "VILA",
      sessionType: "rest",
      intervals: [],
      intensity: "rest",
      detail: "Vila, vätska och förberedelser.",
    },
    {
      id: "w43-d4",
      week: 43,
      dayOfWeek: 4,
      date: addDays(race, -1),
      title: "Lätt väckningspass",
      sessionType: "recovery",
      durationMin: 30,
      zone: "Z1",
      intervals: [],
      intensity: "easy",
      detail: "30 min lätt cykling. Avsluta pigg.",
    },
    {
      id: "w43-d5",
      week: 43,
      dayOfWeek: 5,
      date: race,
      title: "Vätternrundan",
      sessionType: "race",
      durationMin: 540,
      intervals: [],
      intensity: "hard",
      detail: "315 km. Mål: sub 9 timmar.",
    },
  ];

  const weeks: WeekPlan[] = selected.map((source, index) => {
    const outputWeek = index + 1;
    const range = ranges[index];
    const weekStart = range.start;
    const weekEnd = range.end;
    const isFinal = index === selected.length - 1;
    const templateSessions =
      isFinal && source.sessions.length === 0 ? raceFallback : source.sessions;
    const monday = addDays(weekStart, -(isoWeekday(weekStart) - 1));

    // Deterministic, load-safe mapping: retain only template weekdays that
    // physically exist in this calendar block. A Sunday start therefore gets
    // only Sunday's template session; no seven-day load is compressed.
    const sessions = templateSessions
      .map((session): PlannedSession => {
        const date =
          isFinal && session.sessionType === "race"
            ? race
            : addDays(monday, session.dayOfWeek - 1);
        return {
          ...session,
          week: outputWeek,
          dayOfWeek: isoWeekday(date),
          date,
        };
      })
      .filter(
        (session) =>
          session.date >= weekStart &&
          session.date <= weekEnd &&
          session.date <= race
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      ...source,
      week: outputWeek,
      startDateISO: weekStart,
      dateRange: dateRange(weekStart, weekEnd),
      sessions,
    };
  });

  return { ...seed, startDateISO: start, weeks };
}

export function personalizedPlanForSettings(settings?: Partial<Settings> | null): PlanSeed {
  return buildPersonalizedPlan(settings?.planStartDate || planSeed.startDateISO);
}

