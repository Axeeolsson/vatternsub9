// Offline-first cloud sync between local Dexie and Supabase.
//
// The app always works locally (no login / no network). When the user is
// logged in AND online we reconcile local <-> cloud with a pragmatic
// last-write-wins strategy keyed by a per-record UUID (`syncId`) and an
// `updatedAt` timestamp. Deletions propagate via tombstones.

import { db, type Tombstone } from "./db";
import { supabase } from "./supabase";
import type { FtpTest, LoggedSession, Settings } from "../lib/types";

export type SyncStatus = "local" | "offline" | "syncing" | "idle" | "error";

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
}

let state: SyncState = { status: "local", lastSyncAt: null, error: null };
const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}
export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

const iso = (ms?: number) => new Date(ms ?? Date.now()).toISOString();
const ms = (s?: string | null) => (s ? new Date(s).getTime() : 0);

// ---- row mappers -----------------------------------------------------------

function loggedToRemote(l: LoggedSession, userId: string) {
  return {
    user_id: userId,
    sync_id: l.syncId,
    date: l.date,
    session_type: l.sessionType,
    activity: l.activity ?? null,
    title: l.title,
    duration_min: l.durationMin ?? null,
    avg_speed_kmh: l.avgSpeedKmh ?? null,
    avg_watts: l.avgWatts ?? null,
    normalized_watts: l.normalizedWatts ?? null,
    avg_hr: l.avgHr ?? null,
    rpe: l.rpe ?? null,
    distance_km: l.distanceKm ?? null,
    intervals: l.intervals ?? null,
    metrics: l.metrics ?? null,
    notes: l.notes ?? null,
    satisfies_planned_id: l.satisfiesPlannedId ?? null,
    completed_at: l.completedAt ?? Date.now(),
    updated_at: iso(l.updatedAt),
    deleted: false,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function remoteToLogged(r: any): LoggedSession {
  return {
    date: r.date,
    sessionType: r.session_type,
    activity: r.activity ?? undefined,
    title: r.title ?? "",
    durationMin: r.duration_min ?? undefined,
    avgSpeedKmh: r.avg_speed_kmh ?? undefined,
    avgWatts: r.avg_watts ?? undefined,
    normalizedWatts: r.normalized_watts ?? undefined,
    avgHr: r.avg_hr ?? undefined,
    rpe: r.rpe ?? undefined,
    distanceKm: r.distance_km ?? undefined,
    intervals: r.intervals ?? undefined,
    metrics: r.metrics ?? undefined,
    notes: r.notes ?? undefined,
    satisfiesPlannedId: r.satisfies_planned_id ?? undefined,
    completedAt: r.completed_at ?? Date.now(),
    syncId: r.sync_id,
    updatedAt: ms(r.updated_at),
  };
}

function ftpToRemote(t: FtpTest, userId: string) {
  return {
    user_id: userId,
    sync_id: t.syncId,
    date: t.date,
    ftp_watts: t.ftpWatts,
    weight_kg: t.weightKg ?? null,
    source: t.source ?? null,
    notes: t.notes ?? null,
    updated_at: iso(t.updatedAt),
    deleted: false,
  };
}
function remoteToFtp(r: any): FtpTest {
  return {
    date: r.date,
    ftpWatts: r.ftp_watts,
    weightKg: r.weight_kg ?? undefined,
    source: r.source ?? undefined,
    notes: r.notes ?? undefined,
    syncId: r.sync_id,
    updatedAt: ms(r.updated_at),
  };
}

function settingsToRemote(s: Settings, userId: string) {
  return {
    user_id: userId,
    weight_kg: s.weightKg,
    current_ftp: s.currentFtp,
    goal_finish_seconds: s.goalFinishSeconds,
    rest_days_per_week: s.restDaysPerWeek,
    bike_mass_kg: s.bikeMassKg,
    auto_adjust: s.autoAdjust,
    group_size: s.groupSize,
    updated_at: iso(s.updatedAt),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- table sync ------------------------------------------------------------

async function syncLogged(userId: string) {
  const { data: remoteRows, error } = await supabase
    .from("logged_sessions")
    .select("*");
  if (error) throw error;
  const remote = remoteRows ?? [];
  const tombs = await db.tombstones.where("table").equals("logged").toArray();
  const tombSet = new Set(tombs.map((t) => t.syncId));

  // Pull remote -> local (skip syncIds we have a pending local delete for).
  for (const r of remote) {
    if (tombSet.has(r.sync_id)) continue;
    const local = await db.loggedSessions.where("syncId").equals(r.sync_id).first();
    if (r.deleted) {
      if (local?.id != null) await db.loggedSessions.delete(local.id);
      continue;
    }
    if (!local) {
      await db.loggedSessions.add(remoteToLogged(r));
    } else if (ms(r.updated_at) > (local.updatedAt ?? 0)) {
      await db.loggedSessions.put({ ...remoteToLogged(r), id: local.id });
    }
  }

  // Push local -> remote.
  const remoteBy = new Map(remote.map((r) => [r.sync_id, r]));
  const locals = await db.loggedSessions.toArray();
  const ups: ReturnType<typeof loggedToRemote>[] = [];
  for (const l of locals) {
    if (!l.syncId) continue;
    const r = remoteBy.get(l.syncId);
    if (!r || (l.updatedAt ?? 0) > ms(r.updated_at)) ups.push(loggedToRemote(l, userId));
  }
  for (const t of tombs) {
    const r = remoteBy.get(t.syncId);
    if (!r || t.updatedAt > ms(r.updated_at))
      ups.push({
        ...(r ? remoteToLoggedRemoteShell(r, userId) : emptyLoggedShell(t.syncId, userId)),
        updated_at: iso(t.updatedAt),
        deleted: true,
      });
  }
  if (ups.length) {
    const { error: upErr } = await supabase
      .from("logged_sessions")
      .upsert(ups, { onConflict: "user_id,sync_id" });
    if (upErr) throw upErr;
  }
  if (tombs.length) await db.tombstones.bulkDelete(tombs.map((t) => t.syncId));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function remoteToLoggedRemoteShell(r: any, userId: string) {
  return { ...r, user_id: userId };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
function emptyLoggedShell(syncId: string, userId: string) {
  return {
    user_id: userId,
    sync_id: syncId,
    date: null,
    session_type: null,
    activity: null,
    title: null,
    duration_min: null,
    avg_speed_kmh: null,
    avg_watts: null,
    normalized_watts: null,
    avg_hr: null,
    rpe: null,
    distance_km: null,
    intervals: null,
    metrics: null,
    notes: null,
    satisfies_planned_id: null,
    completed_at: null,
    updated_at: iso(),
    deleted: true,
  } as unknown as ReturnType<typeof loggedToRemote>;
}

async function syncFtp(userId: string) {
  const { data: remoteRows, error } = await supabase.from("ftp_tests").select("*");
  if (error) throw error;
  const remote = remoteRows ?? [];
  const tombs = await db.tombstones.where("table").equals("ftp").toArray();
  const tombSet = new Set(tombs.map((t) => t.syncId));

  for (const r of remote) {
    if (tombSet.has(r.sync_id)) continue;
    const local = await db.ftpTests.where("syncId").equals(r.sync_id).first();
    if (r.deleted) {
      if (local?.id != null) await db.ftpTests.delete(local.id);
      continue;
    }
    if (!local) await db.ftpTests.add(remoteToFtp(r));
    else if (ms(r.updated_at) > (local.updatedAt ?? 0))
      await db.ftpTests.put({ ...remoteToFtp(r), id: local.id });
  }

  const remoteBy = new Map(remote.map((r) => [r.sync_id, r]));
  const locals = await db.ftpTests.toArray();
  const ups: Record<string, unknown>[] = [];
  for (const t of locals) {
    if (!t.syncId) continue;
    const r = remoteBy.get(t.syncId);
    if (!r || (t.updatedAt ?? 0) > ms(r.updated_at)) ups.push(ftpToRemote(t, userId));
  }
  for (const t of tombs) {
    const r = remoteBy.get(t.syncId);
    if (!r || t.updatedAt > ms(r.updated_at))
      ups.push({
        user_id: userId,
        sync_id: t.syncId,
        date: null,
        ftp_watts: null,
        weight_kg: null,
        source: null,
        notes: null,
        updated_at: iso(t.updatedAt),
        deleted: true,
      });
  }
  if (ups.length) {
    const { error: upErr } = await supabase
      .from("ftp_tests")
      .upsert(ups, { onConflict: "user_id,sync_id" });
    if (upErr) throw upErr;
  }
  if (tombs.length) await db.tombstones.bulkDelete(tombs.map((t) => t.syncId));
}

async function syncSettings(userId: string) {
  const { data: remote, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const localRaw = await db.settings.get("singleton");
  const local = localRaw ?? undefined;
  const localMs = local?.updatedAt ?? 0;

  if (remote && ms(remote.updated_at) > localMs) {
    // remote newer -> apply to local without bumping updatedAt
    const patch: Settings = {
      id: "singleton",
      weightKg: remote.weight_kg,
      currentFtp: remote.current_ftp,
      goalFinishSeconds: remote.goal_finish_seconds,
      restDaysPerWeek: remote.rest_days_per_week,
      bikeMassKg: remote.bike_mass_kg,
      autoAdjust: remote.auto_adjust,
      groupSize: remote.group_size,
      updatedAt: ms(remote.updated_at),
    };
    await db.settings.put(patch);
  } else if (local && localMs >= ms(remote?.updated_at)) {
    const { error: upErr } = await supabase
      .from("user_settings")
      .upsert(settingsToRemote(local, userId), { onConflict: "user_id" });
    if (upErr) throw upErr;
  }
}

// ---- orchestration ---------------------------------------------------------

let running = false;
let pending = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

export async function syncNow(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) {
    setState({ status: "local", error: null });
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setState({ status: "offline" });
    return;
  }
  if (running) {
    pending = true;
    return;
  }
  running = true;
  setState({ status: "syncing", error: null });
  try {
    await syncSettings(userId);
    await syncFtp(userId);
    await syncLogged(userId);
    const now = Date.now();
    await db.meta.put({ key: "lastSyncAt", value: String(now) });
    setState({ status: "idle", lastSyncAt: now, error: null });
  } catch (e) {
    setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
    if (pending) {
      pending = false;
      void syncNow();
    }
  }
}

/** Debounced trigger used after local writes. */
export function notifyLocalChange(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), 1500);
}

let initialized = false;
export function initSync(): void {
  if (initialized) return;
  initialized = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) void syncNow();
    else setState({ status: "local", error: null });
  });
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void syncNow());
    window.addEventListener("focus", () => void syncNow());
  }
  // Restore last sync time and attempt an initial sync if already signed in.
  void db.meta.get("lastSyncAt").then((m) => {
    if (m?.value) setState({ lastSyncAt: Number(m.value) });
  });
  void syncNow();
}

export async function recordTombstone(
  table: Tombstone["table"],
  syncId?: string
): Promise<void> {
  if (!syncId) return;
  await db.tombstones.put({ table, syncId, updatedAt: Date.now() });
}
