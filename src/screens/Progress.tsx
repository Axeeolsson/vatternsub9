import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { useEngineState } from "../hooks/useData";
import { assessLevel } from "../lib/planEngine";
import { zonesForFtp } from "../lib/zones";
import { fmtHms, fmtDateShort, todayISO, fmtDuration } from "../lib/format";
import { Sheet, Stat } from "../components/ui";
import { repo } from "../db/repository";
import type { FtpTest } from "../lib/types";

export function Progress() {
  const state = useEngineState();
  const [ftpOpen, setFtpOpen] = useState(false);

  const level = useMemo(() => (state ? assessLevel(state) : undefined), [state]);

  if (!state || !level) return <div className="p-6 text-slate-400">Laddar…</div>;

  const ftpData = state.ftps.map((t) => ({
    date: t.date,
    label: fmtDateShort(t.date),
    ftp: t.ftpWatts,
    wkg: t.weightKg ? +(t.ftpWatts / t.weightKg).toFixed(2) : undefined,
  }));

  const zones = zonesForFtp(level.ftp);
  const goalHit = level.projectedFinishSeconds <= level.goalSeconds;
  const gap = Math.abs(level.deltaSeconds);
  const statusColor = goalHit ? "#34d399" : level.status === "on_track" ? "#38bdf8" : "#f59e0b";

  return (
    <div className="p-4 space-y-4 safe-bottom">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Nivå & mål</h1>
        <button className="btn-primary px-4 py-2" onClick={() => setFtpOpen(true)}>
          + FTP-test
        </button>
      </div>

      {level.preliminary && (
        <div className="card p-3 border border-amber-500/30 bg-amber-500/5 text-xs text-amber-200/90">
          Preliminär beräkning: baseras på en <b>uppskattad FTP ({level.ftp} W)</b>,
          inte på loggade pass. Lägg till ett riktigt FTP-test så blir tiden korrekt.
        </div>
      )}

      {/* Projection */}
      <div className="card p-5">
        <div className="text-xs uppercase tracking-widest text-slate-400">
          Beräknad sluttid (315 km, i klunga)
        </div>
        <div className="text-4xl font-black mt-1" style={{ color: statusColor }}>
          {fmtHms(level.projectedFinishSeconds)}
        </div>
        <div className="text-sm text-slate-400 mt-1">
          Mål 9:00:00 · du ligger {goalHit ? "före" : "efter"} med{" "}
          <span style={{ color: statusColor }}>{fmtHms(gap)}</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          Klunga: {level.groupSize} {level.groupSize === 1 ? "person" : "personer"}
          {level.draftSavingPct > 0 ? ` · draft −${level.draftSavingPct}%` : " · ingen draft"}
        </div>
        <details className="mt-3 text-xs text-slate-400">
          <summary className="cursor-pointer text-slate-300">Hur beräknas tiden?</summary>
          <p className="mt-2 leading-relaxed">
            Tiden räknas ut från din <b>FTP</b>, din vikt och din <b>uthållighet</b> via
            en effekt/fart-modell för 315 km. Uthållig effekt ={" "}
            {Math.round(level.sustainableIF * 100)}% av FTP ({Math.round(level.ftp * level.sustainableIF)} W)
            – den andelen stiger med dina långpass. I klunga (draftning ~30% mindre
            luftmotstånd) ger det ~{level.avgSpeedKmh.toFixed(1)} km/h. Ändra
            vikt/antaganden under “Mer”.
          </p>
        </details>
        <div className="mt-3 h-2 rounded-full bg-ink-800 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (level.goalSeconds / level.projectedFinishSeconds) * 100)}%`,
              background: statusColor,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={level.ftpModeled ? "FTP (modell)" : "FTP"}
          value={`${level.ftp} W`}
          sub={level.ftpModeled ? `test: ${level.ftpAnchor} W` : undefined}
          accent="#38bdf8"
        />
        <Stat label="W/kg" value={level.wattsPerKg.toFixed(2)} accent="#34d399" />
        <Stat
          label="Snittfart"
          value={`${level.avgSpeedKmh.toFixed(1)}`}
          sub="km/h"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Krävd FTP för sub 9h"
          value={`${level.requiredFtp} W`}
          sub={`${level.requiredWattsPerKg.toFixed(2)} W/kg`}
        />
        <Stat
          label="Auto-justering"
          value={level.adjustPct === 0 ? "—" : `${level.adjustPct > 0 ? "+" : ""}${level.adjustPct}%`}
          sub={
            level.progressionActive
              ? "uppskruvat (stark form)"
              : level.progressionEased
              ? "nedskruvat (återhämtning)"
              : level.status === "ahead"
              ? "schemat uppjusterat"
              : level.status === "behind"
              ? "schemat nedjusterat"
              : "på målnivå"
          }
          accent={statusColor}
        />
      </div>

      {level.buildWeek && (level.progressionActive || level.progressionEased) && (
        <div
          className={`card p-3 text-xs ${
            level.progressionEased
              ? "border border-amber-500/30 bg-amber-500/5 text-amber-200/90"
              : "border border-emerald-500/30 bg-emerald-500/5 text-emerald-200/90"
          }`}
        >
          <div className="font-semibold text-slate-100 mb-0.5">
            Progressiv överbelastning
          </div>
          {level.progressionNote}
        </div>
      )}

      {/* Durability / endurance */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold">Uthållighet (durability)</div>
          <span
            className="chip"
            style={{
              background:
                (level.durabilityLevel === "hög"
                  ? "#34d399"
                  : level.durabilityLevel === "medel"
                  ? "#38bdf8"
                  : "#f59e0b") + "22",
              color:
                level.durabilityLevel === "hög"
                  ? "#34d399"
                  : level.durabilityLevel === "medel"
                  ? "#38bdf8"
                  : "#f59e0b",
            }}
          >
            {level.durabilityLevel}
          </span>
        </div>
        <div className="text-2xl font-black text-white">
          håller {Math.round(level.sustainableIF * 100)}%{" "}
          <span className="text-sm font-medium text-slate-400">av FTP i 9h</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-ink-800 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round(level.durabilityScore * 100)}%`, background: "#34d399" }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-white/5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Längsta pass (8 v)</div>
            <div className="font-bold text-slate-100">
              {level.longestRideMin ? fmtDuration(level.longestRideMin) : "—"}
              {level.longestRideKm ? (
                <span className="text-slate-400 text-xs"> · {Math.round(level.longestRideKm)} km</span>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Uthållighetsvolym</div>
            <div className="font-bold text-slate-100">
              {level.weeklyEnduranceHours.toFixed(1)} h/vecka
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
          Längre distanspass höjer hur stor andel av din FTP du orkar hålla i 9 h – och
          <b> sänker din beräknade tid</b> utan att FTP ändras. Byggs gradvis: nära toppen
          ({Math.round(0.78 * 100)}%) kräver pass upp mot 5–6 h och jämn volym. Utan
          långpass antas en försiktig nivå ({Math.round(0.62 * 100)}%).
        </p>
      </div>

      {/* FTP model explainer */}
      <div className="card p-4">
        <div className="text-sm font-semibold mb-1">Nivåmodell (auto-FTP)</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          FTP uppdateras automatiskt utifrån forskning. Bara <b>uthålliga</b>{" "}
          nära-maxinsatser (≥8 min, t.ex. 2×20 eller ett 20-min-test) höjer den – korta
          VO2-stötar mäter annat. Efter ett riktigt test tillåts bara realistisk ökning
          (~2–5% per block). Lugn volym <b>bygger</b> den långsamt (max ~4%), och FTP{" "}
          <b>sjunker</b> ~1,5%/vecka om du slutar träna. Allt är dämpat så inget enskilt
          pass svänger den orimligt.
        </p>
        {level.ftpVolumeWeeks > 0 && (
          <div className="mt-2 text-[11px] text-emerald-300/90">
            Volymtrend: {level.ftpVolumeWeeks} av 8 senaste veckorna med bra volym
            {level.ftpVolumeDriftPct > 0 ? ` (+${level.ftpVolumeDriftPct}% bas)` : ""}.
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Senaste test</div>
            <div className="font-bold text-slate-100">{level.ftpAnchor} W</div>
          </div>
          <div className="rounded-xl bg-white/5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Modellerad nu</div>
            <div className="font-bold" style={{ color: "#38bdf8" }}>{level.ftp} W</div>
          </div>
          <div className="rounded-xl bg-white/5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Underlag</div>
            <div className="font-bold text-slate-100">{level.ftpEvidenceCount} pass</div>
          </div>
        </div>
        {level.ftpDecayApplied && (
          <div className="mt-2 text-xs text-amber-300/90">
            Nedjusterad p.g.a. {level.daysSinceStimulus} dagar utan träningsstimulans.
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Logga watt/NP och intervaller (med watt + RPE) för bäst precision. Ett riktigt
          FTP-test nollställer och blir ny referens.
        </p>
      </div>

      {/* FTP chart */}
      <div className="card p-4">
        <div className="text-sm font-semibold mb-2">FTP-utveckling</div>
        {ftpData.length < 2 ? (
          <div className="text-xs text-slate-400 py-6 text-center">
            Lägg till minst två FTP-tester för att se din kurva.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={ftpData} margin={{ left: -20, right: 8, top: 8 }}>
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                domain={["dataMin - 10", "dataMax + 10"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: 12,
                  color: "#e2e8f0",
                }}
              />
              <ReferenceLine
                y={level.requiredFtp}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: "mål", fill: "#f59e0b", fontSize: 10 }}
              />
              <ReferenceLine
                y={level.ftp}
                stroke="#38bdf8"
                strokeDasharray="2 3"
                label={{ value: "nu", fill: "#38bdf8", fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="ftp"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Zones */}
      <div className="card p-4">
        <div className="text-sm font-semibold mb-2">Träningszoner (@ {level.ftp} W)</div>
        <div className="space-y-1.5">
          {zones.map((z) => (
            <div key={z.zone} className="flex items-center gap-2 text-sm">
              <span
                className="w-9 text-center chip"
                style={{ background: z.color + "22", color: z.color }}
              >
                {z.zone}
              </span>
              <span className="text-slate-300 flex-1">{z.name}</span>
              <span className="tabular-nums text-slate-400">
                {z.loWatts}–{z.hiWatts} W
              </span>
            </div>
          ))}
        </div>
      </div>

      <FtpSheet open={ftpOpen} onClose={() => setFtpOpen(false)} defaultWeight={level.weightKg} />
    </div>
  );
}

function FtpSheet({
  open,
  onClose,
  defaultWeight,
}: {
  open: boolean;
  onClose: () => void;
  defaultWeight: number;
}) {
  const [date, setDate] = useState(todayISO());
  const [ftp, setFtp] = useState("");
  const [weight, setWeight] = useState(String(defaultWeight));
  const [source, setSource] = useState<FtpTest["source"]>("20min");

  async function save() {
    if (!ftp) return;
    await repo.addFtp({
      date,
      ftpWatts: Number(ftp),
      weightKg: weight ? Number(weight) : undefined,
      source,
    });
    setFtp("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nytt FTP-test">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Metod</label>
            <select
              className="input"
              value={source}
              onChange={(e) => setSource(e.target.value as FtpTest["source"])}
            >
              <option value="20min">20 min-test</option>
              <option value="ramp">Ramp</option>
              <option value="8min">8 min-test</option>
              <option value="estimate">Uppskattning</option>
              <option value="manual">Manuellt</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">FTP (watt)</label>
            <input
              type="number"
              inputMode="numeric"
              className="input"
              placeholder="t.ex. 245"
              value={ftp}
              onChange={(e) => setFtp(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Vikt (kg)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Tips: kör ett 20-minuterstest och ta 95% av snitteffekten som FTP. Nya tester
          uppdaterar automatiskt dina zoner och justerar schemat.
        </p>
        <button className="btn-primary w-full" onClick={save} disabled={!ftp}>
          Spara FTP-test
        </button>
      </div>
    </Sheet>
  );
}
