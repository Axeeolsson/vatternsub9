import { useMemo, useState } from "react";
import type { IntervalBlock, LoggedSession, SessionType } from "../lib/types";
import type { StoredPlannedSession } from "../db/db";
import { SESSION_TYPE_OPTIONS, metaFor } from "../lib/sessionMeta";
import {
  ACTIVITIES,
  FIELD_DEFS,
  SESSION_FIELDS,
  activityById,
  type FieldKey,
} from "../lib/logFields";
import { repo } from "../db/repository";
import { todayISO } from "../lib/format";
import { SessionIcon } from "./icons";

interface Props {
  date?: string;
  planned?: StoredPlannedSession;
  existing?: LoggedSession;
  onSaved: () => void;
}

const COLUMN_KEYS: FieldKey[] = [
  "durationMin",
  "distanceKm",
  "avgSpeedKmh",
  "avgWatts",
  "normalizedWatts",
  "avgHr",
];

export function LogSessionForm({ date, planned, existing, onSaved }: Props) {
  const initType: SessionType =
    existing?.sessionType ?? planned?.sessionType ?? "endurance";

  const [sessionType, setSessionType] = useState<SessionType>(initType);
  const [activityId, setActivityId] = useState<string>(existing?.activity ?? "");
  const [dateVal, setDateVal] = useState(existing?.date ?? date ?? todayISO());
  const [title, setTitle] = useState(existing?.title ?? planned?.title ?? "");
  const [titleTouched, setTitleTouched] = useState(!!existing);
  const [rpe, setRpe] = useState<number>(existing?.rpe ?? 5);
  const [saving, setSaving] = useState(false);

  const [intervals, setIntervals] = useState<IntervalBlock[]>(
    existing?.intervals ?? planned?.intervals ?? []
  );

  // generic string-valued fields keyed by FieldKey
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    const src: Record<string, unknown> = {
      ...(existing ?? {}),
      ...(existing?.metrics ?? {}),
    };
    if (!existing && planned?.durationMin) v.durationMin = String(planned.durationMin);
    for (const [k, val] of Object.entries(src)) {
      if (typeof val === "number") v[k] = String(val);
    }
    return v;
  });

  const selectedActivity = activityById(activityId);

  const fieldKeys: FieldKey[] = useMemo(() => {
    if (sessionType === "other") {
      const a = activityById(activityId);
      return a ? a.fields : [];
    }
    return SESSION_FIELDS[sessionType] ?? [];
  }, [sessionType, activityId]);

  const setVal = (k: string, val: string) =>
    setValues((prev) => ({ ...prev, [k]: val }));
  const num = (s?: string) =>
    s == null || s.trim() === "" ? undefined : Number(s);

  const defaultTitle = () => {
    if (sessionType === "other")
      return activityById(activityId)?.label ?? "Aktivitet";
    return metaFor(sessionType).label;
  };

  // live pace hint from distance + duration
  const paceHint = useMemo(() => {
    const d = num(values.distanceKm);
    const t = num(values.durationMin);
    if (!d || !t) return "";
    const secPerKm = (t * 60) / d;
    const mm = Math.floor(secPerKm / 60);
    const ss = Math.round(secPerKm % 60);
    return `${mm}:${String(ss).padStart(2, "0")} min/km`;
  }, [values.distanceKm, values.durationMin]);

  async function save() {
    setSaving(true);
    const metrics: Record<string, number> = {};
    for (const k of fieldKeys) {
      const def = FIELD_DEFS[k];
      if (def.kind !== "number") continue;
      if (COLUMN_KEYS.includes(k)) continue;
      if (k === "ftpWatts" || k === "paceMinKm") continue;
      const val = num(values[k]);
      if (val != null) metrics[k] = val;
    }

    const payload: Omit<LoggedSession, "id"> = {
      date: dateVal,
      sessionType,
      activity: sessionType === "other" ? activityId || "other" : undefined,
      title: (titleTouched && title.trim()) || defaultTitle(),
      durationMin: num(values.durationMin),
      distanceKm: num(values.distanceKm),
      avgSpeedKmh: num(values.avgSpeedKmh),
      avgWatts: num(values.avgWatts),
      normalizedWatts: num(values.normalizedWatts),
      avgHr: num(values.avgHr),
      rpe: fieldKeys.includes("rpe") ? rpe : undefined,
      intervals: fieldKeys.includes("intervals") ? intervals : undefined,
      metrics: Object.keys(metrics).length ? metrics : undefined,
      notes: fieldKeys.includes("notes") ? values.notes?.trim() || undefined : undefined,
      satisfiesPlannedId: existing?.satisfiesPlannedId ?? planned?.id,
      completedAt: existing?.completedAt ?? Date.now(),
    };

    if (existing?.id != null) await repo.updateLogged(existing.id, payload);
    else await repo.addLogged(payload);

    // FTP capture: if an FTP value was entered, record an FTP test too.
    const ftp = num(values.ftpWatts);
    if (ftp) {
      const s = await repo.getSettings();
      await repo.addFtp({
        date: dateVal,
        ftpWatts: ftp,
        weightKg: s.weightKg,
        source: "20min",
        notes: "Från loggat tröskelpass",
      });
    }

    setSaving(false);
    onSaved();
  }

  const canSave =
    sessionType !== "other" || !!activityId; // require picking an activity

  return (
    <div className="space-y-4">
      {planned && (
        <div className="card p-3 text-sm text-slate-300">
          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
            <SessionIcon
              type={planned.sessionType}
              size={16}
              color={metaFor(planned.sessionType).color}
            />
            Planerat: {planned.title}
          </div>
          <div className="text-slate-400 mt-1">{planned.detail}</div>
        </div>
      )}

      {/* Type selector */}
      <div>
        <label className="label">Typ av pass</label>
        <div className="grid grid-cols-3 gap-2">
          {SESSION_TYPE_OPTIONS.map((t) => {
            const m = metaFor(t);
            const active = t === sessionType;
            return (
              <button
                key={t}
                onClick={() => {
                  setSessionType(t);
                  if (!titleTouched) setTitle("");
                }}
                className={`rounded-xl px-2 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1 ${
                  active ? "border-transparent text-ink-950" : "border-white/10 text-slate-300 bg-white/5"
                }`}
                style={active ? { background: m.color } : undefined}
              >
                <SessionIcon type={t} size={14} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity dropdown for "Annat" */}
      {sessionType === "other" && (
        <div>
          <label className="label">Aktivitet</label>
          <div className="flex items-center gap-2">
            {selectedActivity && (
              <div className="grid place-items-center w-11 h-11 rounded-xl bg-white/5 shrink-0">
                <selectedActivity.icon size={20} className="text-slate-200" />
              </div>
            )}
            <select
              className="input flex-1"
              value={activityId}
              onChange={(e) => {
                setActivityId(e.target.value);
                if (!titleTouched) setTitle("");
              }}
            >
              <option value="">Välj aktivitet…</option>
              {ACTIVITIES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Date + title */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Datum</label>
          <input
            type="date"
            className="input"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Titel</label>
          <input
            className="input"
            placeholder={defaultTitle()}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
          />
        </div>
      </div>

      {/* Dynamic fields */}
      {sessionType === "other" && !activityId ? (
        <div className="card p-4 text-sm text-slate-400 text-center">
          Välj en aktivitet ovan så visas rätt inmatningsfält.
        </div>
      ) : (
        <DynamicFields
          fieldKeys={fieldKeys}
          values={values}
          setVal={setVal}
          rpe={rpe}
          setRpe={setRpe}
          intervals={intervals}
          setIntervals={setIntervals}
          paceHint={paceHint}
        />
      )}

      <button className="btn-primary w-full" onClick={save} disabled={saving || !canSave}>
        {saving ? "Sparar…" : existing ? "Uppdatera pass" : "Spara pass"}
      </button>
    </div>
  );
}

function DynamicFields({
  fieldKeys,
  values,
  setVal,
  rpe,
  setRpe,
  intervals,
  setIntervals,
  paceHint,
}: {
  fieldKeys: FieldKey[];
  values: Record<string, string>;
  setVal: (k: string, v: string) => void;
  rpe: number;
  setRpe: (n: number) => void;
  intervals: IntervalBlock[];
  setIntervals: (b: IntervalBlock[]) => void;
  paceHint: string;
}) {
  const numberFields = fieldKeys.filter(
    (k) => FIELD_DEFS[k].kind === "number" || k === "paceMinKm"
  );
  const hasIntervals = fieldKeys.includes("intervals");
  const hasRpe = fieldKeys.includes("rpe");
  const hasNotes = fieldKeys.includes("notes");

  return (
    <div className="space-y-4">
      {hasIntervals && (
        <IntervalsEditor intervals={intervals} setIntervals={setIntervals} />
      )}

      {numberFields.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {numberFields.map((k) => {
            const def = FIELD_DEFS[k];
            if (k === "paceMinKm") {
              return (
                <div key={k}>
                  <label className="label">{def.label}</label>
                  <div className="input flex items-center text-slate-400">
                    {paceHint || "—"}
                  </div>
                </div>
              );
            }
            return (
              <div key={k}>
                <label className="label">
                  {def.label}
                  {def.unit ? ` (${def.unit})` : ""}
                </label>
                <input
                  type="number"
                  inputMode={def.inputMode ?? "numeric"}
                  className="input"
                  placeholder={def.placeholder}
                  value={values[k] ?? ""}
                  onChange={(e) => setVal(k, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      {hasRpe && (
        <div>
          <label className="label">Upplevd ansträngning (RPE): {rpe}</label>
          <input
            type="range"
            min={1}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(Number(e.target.value))}
            className="w-full accent-brand"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>1 mycket lätt</span>
            <span>10 maximalt</span>
          </div>
        </div>
      )}

      {hasNotes && (
        <div>
          <label className="label">Anteckningar</label>
          <textarea
            className="input min-h-[70px]"
            value={values.notes ?? ""}
            onChange={(e) => setVal("notes", e.target.value)}
            placeholder="Känsla, väder, teknik…"
          />
        </div>
      )}
    </div>
  );
}

function IntervalsEditor({
  intervals,
  setIntervals,
}: {
  intervals: IntervalBlock[];
  setIntervals: (b: IntervalBlock[]) => void;
}) {
  const update = (i: number, patch: Partial<IntervalBlock>) => {
    const next = intervals.map((iv, idx) => (idx === i ? { ...iv, ...patch } : iv));
    setIntervals(next);
  };
  const add = () =>
    setIntervals([...intervals, { reps: 4, onMin: 5, offMin: 3 }]);
  const remove = (i: number) => setIntervals(intervals.filter((_, idx) => idx !== i));

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-200">Intervaller</div>
        <button className="chip bg-brand/20 text-brand" onClick={add}>
          + Lägg till block
        </button>
      </div>
      {intervals.length === 0 && (
        <div className="text-xs text-slate-500 py-2">
          Inga block. Lägg till hur intervallerna faktiskt blev (antal, tid, vila,
          ansträngning, watt).
        </div>
      )}
      <div className="space-y-3">
        {intervals.map((iv, i) => (
          <div key={i} className="rounded-xl bg-ink-800/60 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">Block {i + 1}</span>
              <button
                className="text-xs text-red-300"
                onClick={() => remove(i)}
              >
                Ta bort
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <IvField label="Antal" value={iv.reps} onChange={(v) => update(i, { reps: v ?? 0 })} />
              <IvField label="Tid (min)" value={iv.onMin} onChange={(v) => update(i, { onMin: v ?? 0 })} />
              <IvField label="Vila (min)" value={iv.offMin} onChange={(v) => update(i, { offMin: v })} />
              <IvField
                label="Ansträngning %"
                value={iv.effortPct}
                onChange={(v) => update(i, { effortPct: v })}
              />
              <IvField label="Watt" value={iv.watts} onChange={(v) => update(i, { watts: v })} />
              <IvField
                label="Kadens"
                value={iv.cadenceRpm?.[0]}
                onChange={(v) =>
                  update(i, { cadenceRpm: v ? [v, v] : undefined })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IvField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
        {label}
      </label>
      <input
        type="number"
        inputMode="numeric"
        className="w-full rounded-lg bg-ink-900 border border-white/10 px-2 py-1.5 text-sm text-slate-100 focus:border-brand focus:outline-none"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value.trim() === "" ? undefined : Number(e.target.value))
        }
      />
    </div>
  );
}
