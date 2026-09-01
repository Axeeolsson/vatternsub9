import Dexie, { type Table } from "dexie";
import type {
  FtpTest,
  LoggedSession,
  PlannedSession,
  Settings,
} from "../lib/types";
import planSeed from "../data/plan.seed";
import { FALLBACKS } from "../lib/settings";
import { buildPersonalizedPlan } from "../lib/personalizedPlan";

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

// A fresh account starts with an EMPTY profile (blank inputs). Only autoAdjust
// has a sensible default. The engine fills gaps via effectiveSettings().
export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  autoAdjust: true,
  profileCompleted: false,
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

export class TrainingDB extends Dexie {
  plannedSessions!: Table<StoredPlannedSession, string>;
  loggedSessions!: Table<LoggedSession, number>;
  ftpTests!: Table<FtpTest, number>;
  settings!: Table<Settings, string>;
  meta!: Table<{ key: string; value: string }, string>;
  tombstones!: Table<Tombstone, string>;

  constructor(name: string) {
    super(name);
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
    // v3: explicit onboarding status + personalized plan start date.
    this.version(3)
      .stores({
        plannedSessions: "id, week, date, dayOfWeek, sessionType",
        loggedSessions: "++id, date, sessionType, satisfiesPlannedId, syncId",
        ftpTests: "++id, date, syncId",
        settings: "id",
        meta: "key",
        tombstones: "syncId, table",
      })
      .upgrade(async (tx) => {
        await tx
          .table("settings")
          .toCollection()
          .modify((r: Settings) => {
            r.autoAdjust = true;
            if (r.profileCompleted !== true) r.profileCompleted = false;
          });
      });
  }
}

export const realDb = new TrainingDB("vatternrundan-sub9");

// Swappable "active" database. Thanks to ESM live bindings, every module that
// does `import { db }` sees the current value. It points to realDb when authed,
// and to an ephemeral guest DB in Test mode. Sync ALWAYS uses realDb, so guest
// data can never be uploaded.
export let db: TrainingDB = realDb;
let guestDb: TrainingDB | null = null;

export function isGuestActive(): boolean {
  return db !== realDb;
}
export function useRealDb(): void {
  db = realDb;
}

/** Replace only the generated plan; logged sessions are never touched. */
export async function rebuildPersonalizedPlan(
  settings: Partial<Settings>,
  target: TrainingDB = db
): Promise<void> {
  if (!settings.planStartDate) return;
  const marker = await target.meta.get("personalizedPlanStart");
  const count = await target.plannedSessions.count();
  if (marker?.value === settings.planStartDate && count > 0) return;

  const plan = buildPersonalizedPlan(settings.planStartDate);
  const rows: StoredPlannedSession[] = plan.weeks.flatMap((week) =>
    week.sessions.map((session) => ({ ...session }))
  );
  await target.transaction("rw", target.plannedSessions, target.meta, async () => {
    await target.plannedSessions.clear();
    if (rows.length) await target.plannedSessions.bulkPut(rows);
    await target.meta.put({
      key: "personalizedPlanStart",
      value: settings.planStartDate as string,
    });
  });
}

/** Enter Test mode: create a fresh throwaway guest DB and seed it. */
export async function enterGuestMode(): Promise<void> {
  if (guestDb) {
    try { await guestDb.delete(); } catch { /* ignore */ }
    guestDb = null;
  }
  try { await Dexie.delete("vatternrundan-guest"); } catch { /* ignore */ }
  guestDb = new TrainingDB("vatternrundan-guest");
  await guestDb.open();
  db = guestDb;
  await ensureSeeded();
}

/** Leave Test mode: switch back to the real DB and delete all guest data. */
export async function exitGuestMode(): Promise<void> {
  db = realDb;
  if (guestDb) {
    try { await guestDb.delete(); } catch { /* ignore */ }
    guestDb = null;
  }
  try { await Dexie.delete("vatternrundan-guest"); } catch { /* ignore */ }
}

/** Start a newly-created cloud account with a genuinely empty local profile. */
export async function resetRealDbForNewAccount(): Promise<void> {
  useRealDb();
  await realDb.delete();
  await realDb.open();
  await ensureSeeded();
}

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
        // updatedAt 0: untouched defaults must NEVER win last-write-wins against
        // a real cloud settings row (otherwise a fresh device would clobber it).
        await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: 0 });
      const anyFtp = await db.ftpTests.count();
      if (anyFtp === 0) {
        await db.ftpTests.put({
          date: planSeed.startDateISO,
          ftpWatts: FALLBACKS.currentFtp,
          weightKg: FALLBACKS.weightKg,
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
