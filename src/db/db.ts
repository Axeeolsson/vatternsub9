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

// Soft-delete record so a deletion made on one device propagates to the cloud
// and to other devices instead of the row simply reappearing on next sync.
export interface Tombstone {
  syncId: string;
  table: "logged" | "ftp";
  updatedAt: number;
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

export function newUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback (older engines): RFC4122-ish v4.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class TrainingDB extends Dexie {
  plannedSessions!: Table<StoredPlannedSession, string>;
  loggedSessions!: Table<LoggedSession, number>;
  ftpTests!: Table<FtpTest, number>;
  settings!: Table<Settings, string>;
  meta!: Table<{ key: string; value: string }, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
    super("vatternrundan-sub9");
    this.version(1).stores({
      plannedSessions: "id, week, date, dayOfWeek, sessionType",
      loggedSessions: "++id, date, sessionType, satisfiesPlannedId",
      ftpTests: "++id, date",
      settings: "id",
      meta: "key",
    });
    // v2: cloud-sync support (syncId indexes, tombstones, backfill).
    this.version(2)
      .stores({
        plannedSessions: "id, week, date, dayOfWeek, sessionType",
        loggedSessions: "++id, date, sessionType, satisfiesPlannedId, syncId",
        ftpTests: "++id, date, syncId",
        settings: "id",
        meta: "key",
        tombstones: "syncId, table",
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx
          .table("loggedSessions")
          .toCollection()
          .modify((r: LoggedSession) => {
            if (!r.syncId) r.syncId = newUuid();
            if (!r.updatedAt) r.updatedAt = r.completedAt ?? now;
          });
        await tx
          .table("ftpTests")
          .toCollection()
          .modify((r: FtpTest) => {
            if (!r.syncId) r.syncId = newUuid();
            if (!r.updatedAt) r.updatedAt = now;
          });
        await tx
          .table("settings")
          .toCollection()
          .modify((r: Settings) => {
            if (!r.updatedAt) r.updatedAt = now;
          });
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
      if (!existing)
        await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: Date.now() });
      const anyFtp = await db.ftpTests.count();
      if (anyFtp === 0) {
        await db.ftpTests.put({
          date: planSeed.startDateISO,
          ftpWatts: DEFAULT_SETTINGS.currentFtp,
          weightKg: DEFAULT_SETTINGS.weightKg,
          source: "estimate",
          notes: "Startvärde – uppdatera efter ditt första FTP-test.",
          syncId: newUuid(),
          updatedAt: Date.now(),
        });
      }
      await db.meta.put({ key: "seedVersion", value: "1" });
    }
  );
}
