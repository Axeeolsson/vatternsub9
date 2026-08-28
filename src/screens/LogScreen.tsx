import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, ChevronLeft } from "lucide-react";
import { db } from "../db/db";
import { repo } from "../db/repository";
import { metaFor } from "../lib/sessionMeta";
import { activityById } from "../lib/logFields";
import { fmtDuration, fmtDateLong } from "../lib/format";
import { Sheet } from "../components/ui";
import { LoggedIcon } from "../components/icons";
import { LogSessionForm } from "../components/LogSessionForm";
import { useEngineState } from "../hooks/useData";
import { sessionImpact } from "../lib/planEngine";
import type { LoggedSession } from "../lib/types";

function loggedTitle(l: LoggedSession): string {
  if (l.title) return l.title;
  if (l.sessionType === "other")
    return activityById(l.activity)?.label ?? "Aktivitet";
  return metaFor(l.sessionType).label;
}

function typeLabel(l: LoggedSession): string {
  if (l.sessionType === "other")
    return activityById(l.activity)?.label ?? "Annat";
  return metaFor(l.sessionType).label;
}

function fmtDeltaW(w: number): string {
  const s = Math.round(w);
  return `${s > 0 ? "+" : s < 0 ? "−" : "±"}${Math.abs(s)} W`;
}
function fmtDeltaTime(sec: number): string {
  const s = Math.round(sec);
  if (s === 0) return "±0 s";
  const sign = s < 0 ? "−" : "+";
  const a = Math.abs(s);
  if (a < 60) return `${sign}${a} s`;
  const mm = Math.floor(a / 60);
  const ss = a % 60;
  return `${sign}${mm}:${String(ss).padStart(2, "0")}`;
}
function fmtDeltaIF(x: number): string {
  if (Math.abs(x) < 0.0005) return "±0";
  return `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(3)}`;
}

export function LogScreen() {
  const logged = useLiveQuery(
    () => db.loggedSessions.orderBy("date").reverse().toArray(),
    []
  );
  const state = useEngineState();
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<LoggedSession | null>(null);
  const [editing, setEditing] = useState(false);

  const detailId = detail?.id ?? null;
  // Always read the freshest copy from live state (so edits reflect instantly).
  const current = useMemo(
    () => state?.logged.find((l) => l.id === detailId) ?? detail,
    [state, detailId, detail]
  );
  const impact = useMemo(
    () => (state && detailId != null ? sessionImpact(state, detailId) : undefined),
    [state, detailId]
  );

  const close = () => {
    setDetail(null);
    setEditing(false);
  };

  async function del(l: LoggedSession | null) {
    if (l?.id != null) await repo.deleteLogged(l.id);
    close();
  }

  return (
    <div className="p-4 space-y-4 safe-bottom">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Träningslogg</h1>
        <button className="btn-primary px-4 py-2" onClick={() => setAddOpen(true)}>
          + Nytt pass
        </button>
      </div>

      {!logged ? (
        <div className="text-slate-400">Laddar…</div>
      ) : logged.length === 0 ? (
        <div className="card p-6 text-center text-slate-400">
          Inga loggade pass ännu. Tryck på “+ Nytt pass” eller checka av dagens pass
          på startsidan.
        </div>
      ) : (
        <div className="space-y-2">
          {logged.map((l) => {
            const m = metaFor(l.sessionType);
            return (
              <button
                key={l.id}
                onClick={() => {
                  setDetail(l);
                  setEditing(false);
                }}
                className="w-full card p-3 text-left flex items-center gap-3"
              >
                <div
                  className="grid place-items-center w-11 h-11 rounded-xl shrink-0"
                  style={{ background: m.bg }}
                >
                  <LoggedIcon session={l} size={20} color={m.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-100 truncate">
                    {loggedTitle(l)}
                  </div>
                  <div className="text-xs text-slate-400">{fmtDateLong(l.date)}</div>
                  <div className="text-xs mt-0.5 flex flex-wrap gap-x-2 text-slate-400">
                    {l.durationMin ? <span>{fmtDuration(l.durationMin)}</span> : null}
                    {l.distanceKm ? <span>{l.distanceKm} km</span> : null}
                    {l.avgWatts ? <span>{l.avgWatts} W</span> : null}
                    {l.avgHr ? <span>{l.avgHr} bpm</span> : null}
                    {l.rpe ? <span>RPE {l.rpe}</span> : null}
                  </div>
                </div>
                <span className="chip shrink-0" style={{ background: m.bg, color: m.color }}>
                  {typeLabel(l)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Add flow — unchanged */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Nytt pass">
        <LogSessionForm onSaved={() => setAddOpen(false)} />
      </Sheet>

      {/* Detail / edit flow */}
      <Sheet
        open={!!detail}
        onClose={close}
        title={editing ? "Redigera pass" : current ? loggedTitle(current) : "Pass"}
        headerAction={
          current &&
          (editing ? (
            <button
              className="btn-ghost px-2 py-1.5"
              onClick={() => setEditing(false)}
              aria-label="Tillbaka"
            >
              <ChevronLeft size={18} />
            </button>
          ) : (
            <button
              className="btn-ghost px-2 py-1.5"
              onClick={() => setEditing(true)}
              aria-label="Redigera"
            >
              <Pencil size={18} />
            </button>
          ))
        }
      >
        {current &&
          (editing ? (
            <div className="space-y-3">
              <LogSessionForm
                existing={current}
                onSaved={() => setEditing(false)}
              />
              <button
                className="btn-ghost w-full text-red-300"
                onClick={() => del(current)}
              >
                Ta bort pass
              </button>
            </div>
          ) : (
            <SessionDetailView session={current} impact={impact} onDelete={() => del(current)} />
          ))}
      </Sheet>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function SessionDetailView({
  session,
  impact,
  onDelete,
}: {
  session: LoggedSession;
  impact: ReturnType<typeof sessionImpact> | undefined;
  onDelete: () => void;
}) {
  const m = metaFor(session.sessionType);
  const metrics: { label: string; value: string }[] = [];
  if (session.durationMin) metrics.push({ label: "Tid", value: fmtDuration(session.durationMin) });
  if (session.distanceKm) metrics.push({ label: "Distans", value: `${session.distanceKm} km` });
  if (session.avgSpeedKmh) metrics.push({ label: "Snittfart", value: `${session.avgSpeedKmh} km/h` });
  if (session.avgWatts) metrics.push({ label: "Snitt-effekt", value: `${session.avgWatts} W` });
  if (session.normalizedWatts) metrics.push({ label: "NP", value: `${session.normalizedWatts} W` });
  if (session.avgHr) metrics.push({ label: "Puls", value: `${session.avgHr} bpm` });
  if (session.rpe) metrics.push({ label: "RPE", value: String(session.rpe) });
  if (session.metrics)
    for (const [k, v] of Object.entries(session.metrics))
      metrics.push({ label: k, value: String(v) });

  const goodTime = impact ? impact.deltaFinishSeconds < 0 : false;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <div
          className="grid place-items-center w-12 h-12 rounded-2xl shrink-0"
          style={{ background: m.bg }}
        >
          <LoggedIcon session={session} size={22} color={m.color} />
        </div>
        <div>
          <div className="font-bold text-white">{loggedTitle(session)}</div>
          <div className="text-xs text-slate-400">
            {fmtDateLong(session.date)} · {typeLabel(session)}
          </div>
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {metrics.map((mm, i) => (
            <Metric key={i} label={mm.label} value={mm.value} />
          ))}
        </div>
      )}

      {session.intervals && session.intervals.length > 0 && (
        <div className="card p-3">
          <div className="text-xs font-semibold text-slate-200 mb-1">Intervaller</div>
          {session.intervals.map((iv, i) => (
            <div key={i} className="text-xs text-slate-300">
              {iv.reps}×{iv.onMin} min
              {iv.offMin != null ? ` / ${iv.offMin} min vila` : ""}
              {iv.watts != null ? ` · ${iv.watts} W` : ""}
              {iv.effortPct != null ? ` · ${iv.effortPct}%` : ""}
            </div>
          ))}
        </div>
      )}

      {session.notes && (
        <div className="card p-3 text-sm text-slate-300">{session.notes}</div>
      )}

      {/* Impact */}
      <div className="card p-4">
        <div className="text-sm font-semibold mb-2">Effekt på din utveckling</div>
        {!impact ? (
          <div className="text-xs text-slate-400">Beräknar…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/5 px-2 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">FTP</div>
                <div
                  className="font-bold"
                  style={{ color: impact.deltaFtp > 0 ? "#34d399" : impact.deltaFtp < 0 ? "#f87171" : "#94a3b8" }}
                >
                  {fmtDeltaW(impact.deltaFtp)}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 px-2 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Tid</div>
                <div
                  className="font-bold"
                  style={{ color: goodTime ? "#34d399" : impact.deltaFinishSeconds > 0 ? "#f87171" : "#94a3b8" }}
                >
                  {fmtDeltaTime(impact.deltaFinishSeconds)}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 px-2 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Uthållighet (IF)</div>
                <div
                  className="font-bold"
                  style={{ color: impact.deltaIF > 0.0005 ? "#34d399" : impact.deltaIF < -0.0005 ? "#f87171" : "#94a3b8" }}
                >
                  {fmtDeltaIF(impact.deltaIF)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {impact.tags.map((t, i) => (
                <span key={i} className="chip bg-white/5 text-slate-300">
                  {t}
                </span>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
              Ett enskilt pass gör liten skillnad ensamt – det är helheten över tid som
              räknas. Siffrorna visar just detta pass marginella bidrag till modellen.
            </p>
          </>
        )}
      </div>

      <button className="btn-ghost w-full text-red-300" onClick={onDelete}>
        Ta bort pass
      </button>
    </div>
  );
}
