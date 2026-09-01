import {
  db,
  DEFAULT_SETTINGS,
  ensureSeeded,
  newUuid,
  rebuildPersonalizedPlan,
  type StoredPlannedSession,
} from "./db";
import type { FtpTest, LoggedSession, Settings } from "../lib/types";
import { notifyLocalChange, recordTombstone } from "./sync";

// Migrate legacy string buckets (from an earlier version) into a rider count.
const LEGACY_GROUP_TO_RIDERS: Record<string, number> = {
  solo: 1,
  small: 3,
  medium: 7,
  large: 12,
  xlarge: 20,
};

function coerceGroupSize(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.round(value);
  }
  if (typeof value === "string" && value in LEGACY_GROUP_TO_RIDERS) {
    return LEGACY_GROUP_TO_RIDERS[value];
  }
  return undefined; // unset -> stays blank in the UI, engine uses fallback
}

export const repo = {
  ensureSeeded,

  // ---- settings ----
  async getSettings(): Promise<Settings> {
    const raw = await db.settings.get("singleton");
    if (!raw) return DEFAULT_SETTINGS;
    return { ...raw, groupSize: coerceGroupSize(raw.groupSize) };
  },
  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const cur = await repo.getSettings();
    const next: Settings = {
      ...cur,
      ...patch,
      id: "singleton",
      autoAdjust: true,
      updatedAt: Date.now(),
    };
    await db.settings.put(next);
    if (next.profileCompleted && next.planStartDate) {
      await rebuildPersonalizedPlan(next);
    }
    notifyLocalChange();
  },

  // ---- planned ----
  async allPlanned(): Promise<StoredPlannedSession[]> {
    return db.plannedSessions.orderBy("date").toArray();
  },
  async plannedForWeek(week: number): Promise<StoredPlannedSession[]> {
    const rows = await db.plannedSessions.where("week").equals(week).toArray();
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  },
  async updatePlanned(
    id: string,
    patch: Partial<StoredPlannedSession>
  ): Promise<void> {
    await db.plannedSessions.update(id, { ...patch, overridden: true });
  },

  // ---- logged ----
  async allLogged(): Promise<LoggedSession[]> {
    return db.loggedSessions.orderBy("date").toArray();
  },
  async loggedForDate(date: string): Promise<LoggedSession[]> {
    return db.loggedSessions.where("date").equals(date).toArray();
  },
  async addLogged(s: Omit<LoggedSession, "id">): Promise<number> {
    const rec: LoggedSession = {
      ...s,
      syncId: s.syncId ?? newUuid(),
      updatedAt: Date.now(),
    };
    const id = await db.loggedSessions.add(rec as LoggedSession);
    notifyLocalChange();
    return id;
  },
  async updateLogged(id: number, patch: Partial<LoggedSession>): Promise<void> {
    await db.loggedSessions.update(id, { ...patch, updatedAt: Date.now() });
    notifyLocalChange();
  },
  async deleteLogged(id: number): Promise<void> {
    const rec = await db.loggedSessions.get(id);
    await db.loggedSessions.delete(id);
    await recordTombstone("logged", rec?.syncId);
    notifyLocalChange();
  },

  // ---- FTP ----
  async allFtp(): Promise<FtpTest[]> {
    return db.ftpTests.orderBy("date").toArray();
  },
  async latestFtp(): Promise<FtpTest | undefined> {
    const all = await db.ftpTests.orderBy("date").toArray();
    return all[all.length - 1];
  },
  async addFtp(t: Omit<FtpTest, "id">): Promise<number> {
    const rec: FtpTest = {
      ...t,
      syncId: t.syncId ?? newUuid(),
      updatedAt: Date.now(),
    };
    const id = await db.ftpTests.add(rec as FtpTest);
    // keep settings.currentFtp in sync with the latest test
    const latest = await repo.latestFtp();
    if (latest) {
      await repo.saveSettings({
        currentFtp: latest.ftpWatts,
        ...(latest.weightKg ? { weightKg: latest.weightKg } : {}),
      });
    }
    notifyLocalChange();
    return id;
  },
  async deleteFtp(id: number): Promise<void> {
    const rec = await db.ftpTests.get(id);
    await db.ftpTests.delete(id);
    await recordTombstone("ftp", rec?.syncId);
    const latest = await repo.latestFtp();
    if (latest) await repo.saveSettings({ currentFtp: latest.ftpWatts });
    notifyLocalChange();
  },

};

export type Repo = typeof repo;
