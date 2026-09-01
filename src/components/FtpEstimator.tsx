import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Sheet } from "./ui";
import {
  estimateFtpFromPowerEffort,
  estimateFtpFromQuestionnaire,
  type CyclingExperience,
  type LongestRide,
  type QualitySessions,
  type WeeklyHours,
  type WeeklySessions,
} from "../lib/ftpEstimator";

interface Props {
  weightKg?: number;
  onApply: (ftp: number, weightKg?: number) => void;
}

type Method = "questions" | "power";

export function FtpEstimator({ weightKg, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("questions");
  const [weight, setWeight] = useState(weightKg ? String(weightKg) : "");
  const [experience, setExperience] = useState<CyclingExperience | "">("");
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours | "">("");
  const [weeklySessions, setWeeklySessions] = useState<WeeklySessions | "">("");
  const [longestRide, setLongestRide] = useState<LongestRide | "">("");
  const [qualitySessions, setQualitySessions] = useState<QualitySessions | "">("");
  const [effortMinutes, setEffortMinutes] = useState("");
  const [effortWatts, setEffortWatts] = useState("");

  const estimate = useMemo(() => {
    if (method === "power") {
      const minutes = Number(effortMinutes);
      const watts = Number(effortWatts);
      if (minutes < 8 || minutes > 90 || watts < 80 || watts > 800) return null;
      return estimateFtpFromPowerEffort(watts, minutes);
    }

    const kg = Number(weight);
    if (
      kg < 35 ||
      kg > 250 ||
      !experience ||
      !weeklyHours ||
      !weeklySessions ||
      !longestRide ||
      !qualitySessions
    )
      return null;
    return estimateFtpFromQuestionnaire({
      weightKg: kg,
      experience,
      weeklyHours,
      weeklySessions,
      longestRide,
      qualitySessions,
    });
  }, [
    method,
    weight,
    experience,
    weeklyHours,
    weeklySessions,
    longestRide,
    qualitySessions,
    effortMinutes,
    effortWatts,
  ]);

  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: Array<[string, string]>
  ) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Välj</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );

  function apply() {
    if (!estimate) return;
    const estimatedWeight = method === "questions" ? Number(weight) : undefined;
    onApply(estimate.ftp, estimatedWeight);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="text-xs font-semibold text-brand inline-flex items-center gap-1"
        onClick={() => {
          if (weightKg) setWeight(String(weightKg));
          setOpen(true);
        }}
      >
        <Calculator size={14} />
        Estimera din FTP
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Estimera din FTP">
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Har du en hård, jämn cykelinsats med wattdata blir uppskattningen bättre.
            Annars använder vi din senaste träningsmängd som ett försiktigt startvärde.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={method === "questions" ? "btn-primary" : "btn-ghost"}
              onClick={() => setMethod("questions")}
            >
              Utan wattdata
            </button>
            <button
              type="button"
              className={method === "power" ? "btn-primary" : "btn-ghost"}
              onClick={() => setMethod("power")}
            >
              Med wattdata
            </button>
          </div>

          {method === "questions" ? (
            <div className="space-y-3">
              <label className="block">
                <span className="label">Vikt (kg)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min="35"
                  max="250"
                  step="0.1"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                />
              </label>
              {select(
                "Hur länge har du cykeltränat regelbundet?",
                experience,
                (value) => setExperience(value as CyclingExperience | ""),
                [
                  ["new", "Mindre än 3 månader"],
                  ["casual", "3–12 månader"],
                  ["regular", "1–3 år"],
                  ["experienced", "Mer än 3 år"],
                ]
              )}
              {select(
                "Cykeltid per vecka de senaste 8 veckorna",
                weeklyHours,
                (value) => setWeeklyHours(value as WeeklyHours | ""),
                [
                  ["under1", "Mindre än 1 timme"],
                  ["1to3", "1–3 timmar"],
                  ["3to5", "3–5 timmar"],
                  ["5to8", "5–8 timmar"],
                  ["over8", "Mer än 8 timmar"],
                ]
              )}
              {select(
                "Cykelpass per vecka",
                weeklySessions,
                (value) => setWeeklySessions(value as WeeklySessions | ""),
                [
                  ["under2", "0–1 pass"],
                  ["2", "2 pass"],
                  ["3", "3 pass"],
                  ["4", "4 pass"],
                  ["over4", "5 pass eller fler"],
                ]
              )}
              {select(
                "Längsta cykelpasset de senaste 8 veckorna",
                longestRide,
                (value) => setLongestRide(value as LongestRide | ""),
                [
                  ["under45", "Mindre än 45 minuter"],
                  ["45to90", "45–90 minuter"],
                  ["90to180", "1,5–3 timmar"],
                  ["over180", "Mer än 3 timmar"],
                ]
              )}
              {select(
                "Hårda eller strukturerade cykelpass per vecka",
                qualitySessions,
                (value) => setQualitySessions(value as QualitySessions | ""),
                [
                  ["0", "Inga"],
                  ["1", "1 pass"],
                  ["2plus", "2 pass eller fler"],
                ]
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Ange en nylig, maximal och jämnt disponerad cykelinsats. Kortare än
                åtta minuter används inte eftersom anaerob effekt då påverkar för mycket.
              </p>
              <label className="block">
                <span className="label">Insatsens längd (minuter)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min="8"
                  max="90"
                  value={effortMinutes}
                  onChange={(event) => setEffortMinutes(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">Snitteffekt under insatsen (watt)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min="80"
                  max="800"
                  value={effortWatts}
                  onChange={(event) => setEffortWatts(event.target.value)}
                />
              </label>
            </div>
          )}

          {estimate && (
            <div className="rounded-2xl bg-brand/10 border border-brand/20 p-4 text-center">
              <div className="text-xs text-slate-400">Uppskattat startvärde</div>
              <div className="text-3xl font-black text-brand">{estimate.ftp} W</div>
              <div className="text-xs text-slate-300">
                Rimligt intervall {estimate.low}–{estimate.high} W · {estimate.confidence} säkerhet
              </div>
            </div>
          )}

          <button type="button" className="btn-primary w-full" disabled={!estimate} onClick={apply}>
            {estimate ? `Använd ${estimate.ftp} W` : "Besvara alla frågor"}
          </button>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Detta är bara ett säkert startvärde för träningszonerna. Gör ett ramp- eller
            20-minuterstest när du kan. British Cycling beräknar normalt FTP som 95 %
            av en korrekt genomförd 20-minutersinsats, men även det har individuell
            variation.
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <a
              className="text-brand underline"
              href="https://www.britishcycling.org.uk/knowledge/article/izn20140820-Training-Understanding-Intensity-3--Power-0"
              target="_blank"
              rel="noreferrer"
            >
              British Cycling
            </a>
            <a
              className="text-brand underline"
              href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9365101/"
              target="_blank"
              rel="noreferrer"
            >
              Forskningsbakgrund
            </a>
          </div>
        </div>
      </Sheet>
    </>
  );
}
