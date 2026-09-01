import { useMemo, useState, type ReactNode } from "react";
import type { Settings } from "../lib/types";
import { RACE_DATE_ISO } from "../lib/constants";
import planSeed from "../data/plan.seed";
import { FtpEstimator } from "./FtpEstimator";

interface Props {
  initial?: Partial<Settings> | null;
  defaultStartDate: string;
  submitLabel?: string;
  allowFtpEstimate?: boolean;
  onSubmit: (settings: Partial<Settings>) => Promise<void>;
}

type Values = {
  weightKg: string;
  currentFtp: string;
  bikeMassKg: string;
  goalHours: string;
  restDays: string;
  groupSize: string;
  planStartDate: string;
};

function initialValues(initial: Partial<Settings> | null | undefined, start: string): Values {
  return {
    weightKg: initial?.weightKg?.toString() ?? "",
    currentFtp: initial?.currentFtp?.toString() ?? "",
    bikeMassKg: initial?.bikeMassKg?.toString() ?? "",
    goalHours: initial?.goalFinishSeconds
      ? (initial.goalFinishSeconds / 3600).toString()
      : "",
    restDays: initial?.restDaysPerWeek?.toString() ?? "",
    groupSize: initial?.groupSize?.toString() ?? "",
    planStartDate: initial?.planStartDate ?? start,
  };
}

export function InformationForm({
  initial,
  defaultStartDate,
  submitLabel = "Gå vidare",
  allowFtpEstimate = false,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<Values>(() =>
    initialValues(initial, defaultStartDate)
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Values, string>> = {};
    const n = (key: keyof Values) => Number(values[key]);
    if (!values.weightKg || n("weightKg") < 35 || n("weightKg") > 250)
      e.weightKg = "Ange en vikt mellan 35 och 250 kg.";
    if (!values.currentFtp || n("currentFtp") < 80 || n("currentFtp") > 600)
      e.currentFtp = "Ange FTP mellan 80 och 600 watt.";
    if (!values.bikeMassKg || n("bikeMassKg") < 5 || n("bikeMassKg") > 30)
      e.bikeMassKg = "Ange 5–30 kg för cykel och utrustning.";
    if (!values.goalHours || n("goalHours") < 6 || n("goalHours") > 15)
      e.goalHours = "Ange en måltid mellan 6 och 15 timmar.";
    if (
      values.restDays === "" ||
      !Number.isInteger(n("restDays")) ||
      n("restDays") < 0 ||
      n("restDays") > 4
    )
      e.restDays = "Ange 0–4 hela vilodagar.";
    if (
      !values.groupSize ||
      !Number.isInteger(n("groupSize")) ||
      n("groupSize") < 1 ||
      n("groupSize") > 100
    )
      e.groupSize = "Ange 1–100 cyklister.";
    if (!values.planStartDate) e.planStartDate = "Välj planens startdatum.";
    else if (values.planStartDate < planSeed.startDateISO)
      e.planStartDate = `Startdatum kan tidigast vara ${planSeed.startDateISO}.`;
    else if (values.planStartDate > RACE_DATE_ISO)
      e.planStartDate = "Startdatum måste vara senast på tävlingsdagen.";
    return e;
  }, [values]);

  const valid = Object.keys(errors).length === 0;
  const field = (
    key: keyof Values,
    label: string,
    options: {
      type?: string;
      inputMode?: "numeric" | "decimal";
      step?: string;
      min?: string;
      max?: string;
      action?: ReactNode;
    } = {}
  ) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <label className="label">{label}</label>
        {options.action}
      </div>
      <input
        type={options.type ?? "number"}
        inputMode={options.inputMode}
        step={options.step}
        min={options.min}
        max={options.max}
        className={`input ${submitted && errors[key] ? "border-red-400" : ""}`}
        value={values[key]}
        onChange={(event) =>
          setValues((current) => ({ ...current, [key]: event.target.value }))
        }
      />
      {submitted && errors[key] && (
        <p className="mt-1 text-xs text-red-300">{errors[key]}</p>
      )}
    </div>
  );

  async function submit() {
    setSubmitted(true);
    if (!valid) return;
    setSaving(true);
    try {
      await onSubmit({
        weightKg: Number(values.weightKg),
        currentFtp: Number(values.currentFtp),
        bikeMassKg: Number(values.bikeMassKg),
        goalFinishSeconds: Number(values.goalHours) * 3600,
        restDaysPerWeek: Number(values.restDays),
        groupSize: Number(values.groupSize),
        planStartDate: values.planStartDate,
        profileCompleted: true,
        autoAdjust: true,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field("weightKg", "Vikt (kg)", { inputMode: "decimal", step: "0.1" })}
        {field("currentFtp", "FTP-utgångsvärde (watt)", {
          inputMode: "numeric",
          action: allowFtpEstimate ? (
            <FtpEstimator
              weightKg={Number(values.weightKg) || undefined}
              onApply={(ftp, estimatedWeight) =>
                setValues((current) => ({
                  ...current,
                  currentFtp: String(ftp),
                  ...(estimatedWeight ? { weightKg: String(estimatedWeight) } : {}),
                }))
              }
            />
          ) : undefined,
        })}
        {field("bikeMassKg", "Cykel + utrustning (kg)", {
          inputMode: "decimal",
          step: "0.1",
        })}
        {field("goalHours", "Måltid (timmar)", {
          inputMode: "decimal",
          step: "0.25",
        })}
        {field("restDays", "Vilodagar per vecka", {
          inputMode: "numeric",
          min: "0",
          max: "4",
        })}
        {field("groupSize", "Antal i klungan", {
          inputMode: "numeric",
          min: "1",
          max: "100",
        })}
      </div>
      {field("planStartDate", "Planens startdatum", {
        type: "date",
        min: planSeed.startDateISO,
        max: RACE_DATE_ISO,
      })}

      <p className="text-xs text-slate-400">
        Schemat anpassas alltid i realtid efter FTP, uthållighet, ansträngning,
        genomförda och missade pass. Startdatumet blir vecka 1 och planen anpassas
        fram till Vätternrundan.
      </p>

      <button
        className="btn-primary w-full"
        onClick={submit}
        disabled={saving}
      >
        {saving ? "Sparar…" : submitLabel}
      </button>
    </div>
  );
}

