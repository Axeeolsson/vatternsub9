import Dexie, { type Table } from "dexie";
import type {
  FtpTest,
  LoggedSession,
  PlannedSession,
  Settings,
} from "../lib/types";
import planSeed from "../data/plan.seed";

// A planned session stored in the DB: the seed fields plus a "satisfied" flag
// the engine can toggle when a matching session is logged.
export interface StoredPlannedSession extends PlannedSession {
  overridden?: boolean; // user manually edited this session
}

export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  weightKg: 78,
  currentFtp: 220,
  goalFinishSeconds: 9 * 3600,
  restDaysPerWeek: 1,
  bikeMassKg: 9,
  autoAdjust: true,
  groupSize: 8,
};

class TrainingDB extends Dexie {
  plannedSessions!: Table<StoredPlannedSession, string>;
  loggedSessions!: Table<LoggedSession, number>;
  ftpTests!: Table<FtpTest, number>;
  settings!: Table<Settings, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("vatternrundan-sub9");
    this.version(1).stores({
      plannedSessions: "id, week, date, dayOfWeek, sessionType",
      loggedSessions: "++id, date, sessionType, satisfiesPlannedId",
      ftpTests: "++id, date",
      settings: "id",
      meta: "key",
    });
  }
}

export const db = new TrainingDB();

/** Seed the planned template + defaults on first run. Idempotent. */
export async function ensureSeeded(): Promise<void> {
  const seededFlag = await db.meta.get("seedVersion");
  const count = await db.plannedSessions.count();
  if (seededFlag?.value === "1" && count > 0) return;

  await db.transaction(
    "rw",
    db.plannedSessions,
    db.settings,
    db.ftpTests,
    db.meta,
    async () => {
      if (count === 0) {
        const rows: StoredPlannedSession[] = [];
        for (const w of planSeed.weeks) {
          for (const s of w.sessions) rows.push({ ...s });
        }
        await db.plannedSessions.bulkPut(rows);
      }
      const existing = await db.settings.get("singleton");
      if (!existing) await db.settings.put(DEFAULT_SETTINGS);
      const anyFtp = await db.ftpTests.count();
      if (anyFtp === 0) {
        await db.ftpTests.put({
          date: planSeed.startDateISO,
          ftpWatts: DEFAULT_SETTINGS.currentFtp,
          weightKg: DEFAULT_SETTINGS.weightKg,
          source: "estimate",
          notes: "Startvärde – uppdatera efter ditt första FTP-test.",
        });
      }
      await db.meta.put({ key: "seedVersion", value: "1" });
    }
  );
}
