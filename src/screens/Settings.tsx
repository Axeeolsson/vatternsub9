import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { repo } from "../db/repository";
import type { Settings as SettingsT } from "../lib/types";
import { fmtHms } from "../lib/format";
import { draftFactorForRiders } from "../lib/powerModel";
import { useAuth, useSyncState } from "../hooks/useAuth";

// Empty string -> undefined (unset); otherwise a finite number.
function numOrUndef(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function Settings() {
  const { email } = useAuth();
  const settings = useLiveQuery(() => db.settings.get("singleton"), []);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<SettingsT>) => {
    repo.saveSettings(patch);
  };

  async function doExport() {
    const json = await repo.exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vatternrundan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Backup exporterad.");
  }

  async function doImport(file: File) {
    const text = await file.text();
    try {
      await repo.importJson(text);
      setMsg("Backup importerad.");
    } catch {
      setMsg("Kunde inte läsa filen.");
    }
  }

  return (
    <div className="p-4 space-y-4 safe-bottom">
      <h1 className="text-xl font-bold">Inställningar</h1>

      <AccountSync />

      {!email ? (
        <div className="card p-4 text-sm text-slate-400">
          Logga in för att se och hantera dina inställningar.
        </div>
      ) : !settings ? (
        <div className="p-6 text-slate-400">Laddar…</div>
      ) : (
        <>
          <div className="card p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-200">Din profil</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Vikt (kg)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input"
                  placeholder="t.ex. 78"
                  value={settings.weightKg ?? ""}
                  onChange={(e) => update({ weightKg: numOrUndef(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Cykel + utrustning (kg)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input"
                  placeholder="t.ex. 9"
                  value={settings.bikeMassKg ?? ""}
                  onChange={(e) => update({ bikeMassKg: numOrUndef(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="label">FTP-utgångsvärde (watt)</label>
              <input
                type="number"
                inputMode="numeric"
                className="input"
                placeholder="t.ex. 250"
                value={settings.currentFtp ?? ""}
                onChange={(e) => update({ currentFtp: numOrUndef(e.target.value) })}
              />
              <p className="text-xs text-slate-500 mt-1">
                Baslinje tills du gör ett FTP-test. Din <b>aktuella</b> FTP modelleras
                sedan automatiskt från watten i loggade pass (och sjunker om du inte
                tränar).
              </p>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-200">Mål & schema</div>
            <div>
              <label className="label">Måltid (timmar)</label>
              <input
                type="number"
                step="0.25"
                inputMode="decimal"
                className="input"
                placeholder="t.ex. 9"
                value={
                  settings.goalFinishSeconds ? settings.goalFinishSeconds / 3600 : ""
                }
                onChange={(e) => {
                  const h = numOrUndef(e.target.value);
                  update({ goalFinishSeconds: h == null ? undefined : h * 3600 });
                }}
              />
              {settings.goalFinishSeconds ? (
                <p className="text-xs text-slate-500 mt-1">
                  Nuvarande mål: {fmtHms(settings.goalFinishSeconds)}
                </p>
              ) : null}
            </div>
            <div>
              <label className="label">Vilodagar per vecka</label>
              <input
                type="number"
                min={0}
                max={4}
                inputMode="numeric"
                className="input"
                placeholder="t.ex. 1"
                value={settings.restDaysPerWeek ?? ""}
                onChange={(e) => update({ restDaysPerWeek: numOrUndef(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Antal i klungan (draftning)</label>
              <input
                type="number"
                min={1}
                max={200}
                inputMode="numeric"
                className="input"
                placeholder="t.ex. 8"
                value={settings.groupSize ?? ""}
                onChange={(e) => {
                  const n = numOrUndef(e.target.value);
                  update({
                    groupSize: n == null ? undefined : Math.max(1, Math.round(n)),
                  });
                }}
              />
              <p className="text-xs text-slate-500 mt-1">
                Antal cyklister du åker med (1 = solo). Fler i klungan = mer draftning.
                {settings.groupSize ? (
                  <>
                    {" "}
                    Nu:{" "}
                    <b>
                      draft −{Math.round((1 - draftFactorForRiders(settings.groupSize)) * 100)}%
                    </b>
                    .
                  </>
                ) : null}{" "}
                Påverkar beräknad tid och krävd FTP.
              </p>
            </div>
            <label className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-200">
                Anpassa schemat automatiskt efter min nivå
              </span>
              <input
                type="checkbox"
                className="w-5 h-5 accent-brand"
                checked={settings.autoAdjust ?? true}
                onChange={(e) => update({ autoAdjust: e.target.checked })}
              />
            </label>
          </div>

          <div className="card p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-200">Säkerhetskopiering</div>
            <p className="text-xs text-slate-400">
              Din data synkas i molnet när du är inloggad. Du kan även exportera en
              JSON-fil som lokal backup.
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={doExport}>
                Exportera
              </button>
              <button
                className="btn-ghost flex-1"
                onClick={() => fileRef.current?.click()}
              >
                Importera
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doImport(f);
                  e.target.value = "";
                }}
              />
            </div>
            <button
              className="btn-ghost w-full text-red-300"
              onClick={async () => {
                if (
                  confirm(
                    "Nollställ ALL data och återställ schemat? Detta går inte att ångra."
                  )
                ) {
                  await repo.resetAll();
                  setMsg("Allt nollställt och schemat återställt.");
                }
              }}
            >
              Nollställ allt
            </button>
            {msg && <div className="text-xs text-emerald-300">{msg}</div>}
          </div>
        </>
      )}

      <div className="text-center text-xs text-slate-600 pt-2">
        Vätternrundan sub-9h · v1
      </div>
    </div>
  );
}

function AccountSync() {
  const { email, signUp, signIn, signOut } = useAuth();
  const sync = useSyncState();
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"info" | "error">("info");
  const [busy, setBusy] = useState(false);

  const statusLabel =
    sync.status === "syncing"
      ? "Synkar…"
      : sync.status === "idle"
      ? "Synkad"
      : sync.status === "error"
      ? "Synkfel"
      : sync.status === "offline"
      ? "Offline"
      : "Endast lokalt";

  function translateError(m: string): string {
    const s = m.toLowerCase();
    if (s.includes("invalid login")) return "Fel e-post eller lösenord.";
    if (
      s.includes("already registered") ||
      s.includes("already been registered") ||
      s.includes("user already")
    )
      return "Det finns redan ett konto med den e-posten – tryck Logga in istället.";
    if (
      s.includes("password") &&
      (s.includes("6") || s.includes("short") || s.includes("weak") || s.includes("at least"))
    )
      return "Lösenordet måste vara minst 6 tecken.";
    if (s.includes("email") && s.includes("valid")) return "Ogiltig e-postadress.";
    if (s.includes("fetch") || s.includes("network"))
      return "Nätverksfel – kontrollera din uppkoppling.";
    if (s.includes("confirm"))
      return "Bekräfta din e-post via mejlet, eller be om att e-postbekräftelse stängs av.";
    return m;
  }

  async function doSignUp() {
    const value = emailInput.trim();
    if (!value || password.length < 6) return;
    setBusy(true);
    setMsg("");
    const { data, error } = await signUp(value, password);
    setBusy(false);
    if (error) {
      setMsgKind("error");
      setMsg(translateError(error.message));
      return;
    }
    if (data.user && !data.session) {
      setMsgKind("info");
      setMsg(
        "Konto skapat! Bekräfta din e-post via mejlet, eller be om att e-postbekräftelse stängs av i Supabase."
      );
      return;
    }
    setMsgKind("info");
    setMsg("Konto skapat och inloggad – synkar din data…");
  }

  async function doSignIn() {
    const value = emailInput.trim();
    if (!value || !password) return;
    setBusy(true);
    setMsg("");
    const { error } = await signIn(value, password);
    setBusy(false);
    if (error) {
      setMsgKind("error");
      setMsg(translateError(error.message));
      return;
    }
    setMsg("");
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-semibold text-slate-200">Konto & synk</div>
      {email ? (
        <>
          <div className="text-sm text-slate-300">
            Inloggad som <b>{email}</b>
          </div>
          <div className="text-xs text-slate-400">
            Status: {statusLabel}
            {sync.lastSyncAt
              ? ` · senast ${new Date(sync.lastSyncAt).toLocaleString("sv-SE")}`
              : ""}
          </div>
          {sync.error && <div className="text-xs text-red-300">{sync.error}</div>}
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              onClick={() => sync.syncNow()}
              disabled={sync.status === "syncing"}
            >
              {sync.status === "syncing" ? "Synkar…" : "Synka nu"}
            </button>
            <button className="btn-ghost flex-1 text-red-300" onClick={() => signOut()}>
              Logga ut
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Skapa konto eller logga in med e-post och lösenord för att synka din data
            (loggade pass, FTP-tester, inställningar) mellan alla dina enheter. Appen
            fungerar även utan inloggning – då sparas allt bara lokalt på den här enheten.
          </p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            className="input"
            placeholder="din@mejl.se"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
          />
          <input
            type="password"
            autoComplete="current-password"
            className="input"
            placeholder="Lösenord (minst 6 tecken)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              onClick={doSignUp}
              disabled={busy || !emailInput.trim() || password.length < 6}
            >
              {busy ? "…" : "Skapa konto"}
            </button>
            <button
              className="btn-primary flex-1"
              onClick={doSignIn}
              disabled={busy || !emailInput.trim() || !password}
            >
              {busy ? "…" : "Logga in"}
            </button>
          </div>
          {msg && (
            <div
              className={`text-xs ${
                msgKind === "error" ? "text-red-300" : "text-emerald-300"
              }`}
            >
              {msg}
            </div>
          )}
        </>
      )}
    </div>
  );
}
