import { useMemo, useState } from "react";
import { useEngineState } from "../hooks/useData";
import { useCountdown } from "../hooks/useCountdown";
import { RACE_START_ISO } from "../lib/constants";
import {
  assessLevel,
  recommendForDate,
  weekInfo,
  type ScaledTargets,
} from "../lib/planEngine";
import { todayISO, fmtDuration, fmtDateLong, fmtHms } from "../lib/format";
import { metaFor } from "../lib/sessionMeta";
import { ProgressRing, Sheet } from "../components/ui";
import { LogSessionForm } from "../components/LogSessionForm";
import { SessionIcon } from "../components/icons";

function CountdownBox({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="tabular-nums text-3xl font-black text-white">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-slate-400">{unit}</div>
    </div>
  );
}

function TargetList({ targets }: { targets: ScaledTargets }) {
  return (
    <div className="mt-3 space-y-2">
      {targets.zone && (
        <div className="text-sm text-slate-300">
          Zon <span className="font-semibold">{targets.zone}</span>
          {targets.zoneWattLo != null && (
            <span className="text-slate-400">
              {" "}
              · {targets.zoneWattLo}–{targets.zoneWattHi} W
            </span>
          )}
        </div>
      )}
      {targets.intervals.length > 0 && (
        <div className="space-y-1">
          {targets.intervals.map((iv, i) => (
            <div key={i} className="text-sm text-slate-300">
              <span className="font-semibold text-white">
                {iv.reps}×{iv.onMin} min
              </span>
              {iv.offMin != null && (
                <span className="text-slate-400"> / {iv.offMin} min vila</span>
              )}
              {iv.cadenceRpm && (
                <span className="text-slate-400">
                  {" "}
                  · {iv.cadenceRpm[0]}–{iv.cadenceRpm[1]} rpm
                </span>
              )}
              {iv.wattLo != null && (
                <span className="text-slate-400">
                  {" "}
                  · {iv.wattLo}–{iv.wattHi} W
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Home({ onGoProgress }: { onGoProgress: () => void }) {
  const state = useEngineState();
  const cd = useCountdown(RACE_START_ISO);
  const [logOpen, setLogOpen] = useState(false);
  const today = todayISO();

  const rec = useMemo(
    () => (state ? recommendForDate(state, today) : undefined),
    [state, today]
  );
  const level = useMemo(() => (state ? assessLevel(state) : undefined), [state]);

  if (!state || !rec || !level) {
    return <div className="p-6 text-slate-400">Laddar…</div>;
  }

  const wi = rec.week ? weekInfo(rec.week, state.settings) : undefined;
  const session = rec.recommended;
  const m = session ? metaFor(session.sessionType) : metaFor("rest");
  const weekPct = rec.weekTotal ? rec.weekDone / rec.weekTotal : 0;

  const statusColor =
    level.status === "ahead"
      ? "#34d399"
      : level.status === "on_track"
      ? "#38bdf8"
      : "#f59e0b";
  const statusLabel =
    level.status === "ahead"
      ? "Före schemat"
      : level.status === "on_track"
      ? "Enligt plan"
      : "Efter schemat";

  return (
    <div className="p-4 space-y-4 safe-bottom">
      {/* Countdown */}
      <div className="card p-5 bg-gradient-to-b from-sky-500/10 to-transparent">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-400">
              Vätternrundan · mål sub 9h
            </div>
            <div className="text-sm text-slate-300">
              {fmtDateLong(RACE_START_ISO.slice(0, 10))} 2027
            </div>
          </div>
          <span className="chip" style={{ background: statusColor + "22", color: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-end justify-between px-2">
          <CountdownBox value={cd.days} unit="dagar" />
          <span className="text-2xl text-slate-600 pb-4">:</span>
          <CountdownBox value={cd.hours} unit="tim" />
          <span className="text-2xl text-slate-600 pb-4">:</span>
          <CountdownBox value={cd.minutes} unit="min" />
          <span className="text-2xl text-slate-600 pb-4">:</span>
          <CountdownBox value={cd.seconds} unit="sek" />
        </div>
      </div>

      {/* Weekly adaptation (cross-week) */}
      {rec.weekly && rec.weekly.severity !== "none" && (
        <div
          className={`card p-3 text-xs ${
            rec.weekly.severity === "major"
              ? "border border-red-500/30 bg-red-500/5 text-red-200/90"
              : "border border-amber-500/30 bg-amber-500/5 text-amber-200/90"
          }`}
        >
          <div className="font-semibold mb-0.5 text-slate-100">
            Veckoanpassning
          </div>
          {rec.weekly.message}
        </div>
      )}

      {/* Today card */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-slate-400">
            Idag · {fmtDateLong(today)}
          </div>
          {wi && (
            <div className="text-xs text-slate-400">
              V{rec.week} · {wi.phaseShort}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start gap-3">
          <div
            className="grid place-items-center w-14 h-14 rounded-2xl shrink-0"
            style={{ background: m.bg }}
          >
            <SessionIcon type={session?.sessionType ?? "rest"} size={26} color={m.color} />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-white">
              {rec.isRest ? "Vila" : session?.title ?? "Pass"}
            </div>
            <div className="text-sm" style={{ color: m.color }}>
              {m.label}
              {session?.durationMin || rec.targets?.durationMin ? (
                <span className="text-slate-400">
                  {" "}
                  · {fmtDuration(rec.targets?.durationMin ?? session?.durationMin)}
                  {rec.targets?.adjusted &&
                    rec.targets.baseDurationMin &&
                    rec.targets.baseDurationMin !== rec.targets.durationMin && (
                      <span className="text-emerald-400">
                        {" "}
                        (just. från {fmtDuration(rec.targets.baseDurationMin)})
                      </span>
                    )}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {session && <div className="mt-3 text-sm text-slate-300">{session.detail}</div>}
        {rec.targets && <TargetList targets={rec.targets} />}
        {rec.targets && rec.targets.progressionPct > 0 && (
          <div className="mt-2">
            <span className="chip bg-emerald-500/15 text-emerald-300">
              Uppskruvat pga stark form (+{rec.targets.progressionPct}%)
            </span>
          </div>
        )}
        {rec.targets && rec.targets.eased && (
          <div className="mt-2">
            <span className="chip bg-amber-500/15 text-amber-300">
              Nedskruvat – återhämtning
            </span>
          </div>
        )}

        {/* Reason banner */}
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">
          {rec.reason}
        </div>

        <div className="mt-4 flex gap-2">
          {rec.status === "logged" ? (
            <button className="btn-ghost flex-1" disabled>
              Loggat idag ✓
            </button>
          ) : rec.isRest ? (
            <button className="btn-ghost flex-1" onClick={() => setLogOpen(true)}>
              Kör ett pass ändå
            </button>
          ) : (
            <button className="btn-primary flex-1" onClick={() => setLogOpen(true)}>
              Klar – logga passet
            </button>
          )}
        </div>
      </div>

      {/* Progress + level */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <ProgressRing value={weekPct} size={84} stroke={9} color={m.color}>
            <div className="text-lg font-bold text-white">
              {rec.weekDone}/{rec.weekTotal}
            </div>
            <div className="text-[10px] text-slate-400">vecka</div>
          </ProgressRing>
          <div className="text-xs text-slate-400">
            <div className="font-semibold text-slate-200">Veckans pass</div>
            {wi?.weekType}
          </div>
        </div>

        <button className="card p-4 text-left" onClick={onGoProgress}>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Beräknad tid {level.preliminary && <span className="text-amber-400">· prel.</span>}
          </div>
          <div className="text-2xl font-black" style={{ color: statusColor }}>
            {fmtHms(level.projectedFinishSeconds)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            FTP {level.ftp} W{level.preliminary ? " (uppskattad)" : ""} · {level.wattsPerKg.toFixed(1)} W/kg
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Mål 9:00:00 · kräver ~{level.requiredFtp} W
          </div>
        </button>
      </div>

      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Logga pass">
        <LogSessionForm
          date={today}
          planned={rec.status === "logged" ? undefined : session}
          onSaved={() => setLogOpen(false)}
        />
      </Sheet>
    </div>
  );
}
