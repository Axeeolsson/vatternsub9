import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { repo } from "../db/repository";
import { useAuth, useSyncState } from "../hooks/useAuth";
import { useMode } from "../context/mode";
import { InformationForm } from "../components/InformationForm";
import { todayISO } from "../lib/format";

export function Settings() {
  const settings = useLiveQuery(() => db.settings.get("singleton"), []);
  const [msg, setMsg] = useState("");

  return (
    <div className="p-4 space-y-4 safe-bottom">
      <h1 className="text-xl font-bold">Inställningar</h1>

      {!settings ? (
        <div className="p-6 text-slate-400">Laddar…</div>
      ) : (
        <div className="card p-4">
          <div className="text-sm font-semibold text-slate-200 mb-3">Information</div>
          <InformationForm
            initial={settings}
            defaultStartDate={settings.planStartDate ?? todayISO()}
            submitLabel="Spara"
            onSubmit={async (values) => {
              await repo.saveSettings(values);
              setMsg("Informationen är sparad.");
            }}
          />
          {msg && <div className="text-xs text-emerald-300 mt-2">{msg}</div>}
        </div>
      )}

      <AccountSync />

      <div className="text-center text-xs text-slate-600 pt-2">
        Vätternrundan sub-9h · v1
      </div>
    </div>
  );
}

function AccountSync() {
  const { email, signUp, signIn, signOut } = useAuth();
  const { isGuest } = useMode();
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

  if (isGuest) {
    return (
      <div className="card p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-200">Konto & synk</div>
        <p className="text-xs text-slate-400">
          Testläget sparar eller synkar ingen data. Avsluta testet för att logga in
          eller skapa ett konto.
        </p>
      </div>
    );
  }

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
