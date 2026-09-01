import { useEffect, useMemo, useState } from "react";
import { useEngineState } from "../hooks/useData";
import {
  reconcileWeek,
  weekOfDate,
  isPlannedCompleted,
  loggedOnDate,
  weeklyAdaptation,
} from "../lib/planEngine";
import { todayISO, fmtDuration, dowSwedish, fmtDateShort } from "../lib/format";
import { metaFor } from "../lib/sessionMeta";
import { activityById } from "../lib/logFields";
import { Sheet } from "../components/ui";
import { SessionIcon, LoggedIcon } from "../components/icons";
import { LogSessionForm } from "../components/LogSessionForm";
import type { StoredPlannedSession } from "../db/db";
import type { LoggedSession } from "../lib/types";
import { personalizedPlanForSettings } from "../lib/personalizedPlan";

function loggedTitle(l: LoggedSession): string {
  if (l.title) return l.title;
  if (l.sessionType === "other")
    return activityById(l.activity)?.label ?? "Aktivitet";
  return metaFor(l.sessionType).label;
}

function loggedSummary(l: LoggedSession): string {
  const parts: string[] = [];
  if (l.durationMin) parts.push(fmtDuration(l.durationMin));
  if (l.distanceKm) parts.push(`${l.distanceKm} km`);
  if (l.avgWatts) parts.push(`${l.avgWatts} W`);
  else if (l.avgHr) parts.push(`${l.avgHr} bpm`);
  return parts.join(" · ");
}

export function Schedule() {
  const state = useEngineState();
  const today = todayISO();
  const plan = personalizedPlanForSettings(state?.settings);
  const currentWeek = weekOfDate(today, state?.settings) || 1;
  const [week, setWeek] = useState<number>(1);
  const [sel, setSel] = useState<StoredPlannedSession | null>(null);

  useEffect(() => {
    setWeek(currentWeek < 1 ? 1 : currentWeek);
  }, [currentWeek]);

  const rec = useMemo(
    () => (state ? reconcileWeek(state, week) : undefined),
    [state, week]
  );
  const weekly = useMemo(
    () => (state ? weeklyAdaptation(state, today) : undefined),
    [state, today]
  );
  const wi = plan.weeks.find((w) => w.week === week);

  if (!state || !rec || !wi) return <div className="p-6 text-slate-400">Laddar…</div>;

  return (
    <div className="p-4 space-y-4 safe-bottom">
      {/* Week picker */}
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost px-3 py-2"
          onClick={() => setWeek((w) => Math.max(1, w - 1))}
          disabled={week <= 1}
        >
          ‹
        </button>
        <select
          className="input text-center font-semibold"
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
        >
          {plan.weeks.map((w) => (
            <option key={w.week} value={w.week}>
              Vecka {w.week} · {w.phaseShort}
            </option>
          ))}
        </select>
        <button
          className="btn-ghost px-3 py-2"
          onClick={() => setWeek((w) => Math.min(plan.weeks.length, w + 1))}
          disabled={week >= plan.weeks.length}
        >
          ›
        </button>
      </div>

      <div className="card p-4">
        <div className="text-xs uppercase tracking-widest text-slate-400">
          {wi.phase}
        </div>
        <div className="text-lg font-bold text-white">
          Vecka {wi.week} · {wi.dateRange}
        </div>
        <div className="text-sm text-slate-400">{wi.weekType}</div>
        {week === currentWeek && (
          <span className="chip mt-2 bg-brand/20 text-brand">Denna vecka</span>
        )}
        {week === currentWeek && weekly && weekly.severity !== "none" && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-xs ${
              weekly.severity === "major"
                ? "bg-red-500/10 text-red-200/90"
                : "bg-amber-500/10 text-amber-200/90"
            }`}
          >
            {weekly.message}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {rec.planned.map((s) => {
          const m = metaFor(s.sessionType);
          // Strict per-day completion: only this specific planned session counts,
          // not any same-type session elsewhere in the week or any activity today.
          const done = isPlannedCompleted(s, rec.loggedThisWeek);
          const isToday = s.date === today;
          const dayLogs = loggedOnDate(rec.loggedThisWeek, s.date);

          // Rest is inferred, never completed or missed. It only gets a status
          // when an actual activity was logged on that date.
          const status: "klar" | "ersatt" | "idag" | "missad" | "kvar" | "none" =
            s.sessionType === "rest"
              ? dayLogs.length > 0
                ? "ersatt"
                : "none"
              : done
              ? "klar"
              : dayLogs.length > 0
              ? "ersatt"
              : isToday
              ? "idag"
              : s.date < today
              ? "missad"
              : "kvar";

          const badge =
            status === "none"
              ? null
              : {
                  klar: ["bg-emerald-500/20 text-emerald-300", "✓ Klar"],
                  ersatt: ["bg-indigo-500/20 text-indigo-300", "Ersatt"],
                  idag: ["bg-brand/20 text-brand", "Idag"],
                  missad: ["bg-red-500/20 text-red-300", "Missad"],
                  kvar: ["bg-white/5 text-slate-400", "Kvar"],
                }[status];

          const doneLabel =
            status === "ersatt" ? "Ersatt med:" : status === "klar" ? "Gjort:" : "";

          return (
            <button
              key={s.id}
              onClick={() => setSel(s)}
              className={`w-full card p-3 text-left ${
                isToday ? "ring-1 ring-brand" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="grid place-items-center w-11 h-11 rounded-xl shrink-0"
                  style={{ background: m.bg }}
                >
                  <SessionIcon type={s.sessionType} size={20} color={m.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-16">
                      {dowSwedish(s.dayOfWeek)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {fmtDateShort(s.date)}
                    </span>
                  </div>
                  <div
                    className={`font-semibold truncate ${
                      status === "ersatt" ? "text-slate-400 line-through" : "text-slate-100"
                    }`}
                  >
                    {s.title}
                  </div>
                  <div className="text-xs" style={{ color: m.color }}>
                    {m.label}
                    {s.durationMin ? (
                      <span className="text-slate-500"> · {fmtDuration(s.durationMin)}</span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0">
                  {badge && <span className={`chip ${badge[0]}`}>{badge[1]}</span>}
                </div>
              </div>

              {dayLogs.length > 0 && (
                <div className="mt-2 pl-14 space-y-1">
                  {dayLogs.map((l, i) => (
                    <div
                      key={l.id ?? i}
                      className="flex flex-wrap items-center gap-x-1.5 text-[11px]"
                    >
                      {i === 0 && doneLabel && (
                        <span className="text-slate-500">{doneLabel}</span>
                      )}
                      <LoggedIcon session={l} size={13} className="text-slate-300" />
                      <span className="font-medium text-slate-200">
                        {loggedTitle(l)}
                      </span>
                      {loggedSummary(l) && (
                        <span className="text-slate-500">{loggedSummary(l)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.title ?? "Pass"}>
        {sel && (
          <div className="space-y-4">
            <div className="card p-3 text-sm text-slate-300">{sel.detail}</div>
            <LogSessionForm
              date={sel.date}
              planned={sel.sessionType === "rest" ? undefined : sel}
              onSaved={() => setSel(null)}
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}
