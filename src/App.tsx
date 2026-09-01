import { useEffect, useState } from "react";
import {
  House,
  CalendarDays,
  ClipboardList,
  LineChart,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { Home } from "./screens/Home";
import { Schedule } from "./screens/Schedule";
import { LogScreen } from "./screens/LogScreen";
import { Progress } from "./screens/Progress";
import { Settings } from "./screens/Settings";
import { useAuth, useSyncState } from "./hooks/useAuth";
import { enterGuestMode, exitGuestMode, useRealDb, isGuestActive } from "./db/db";
import { ModeContext } from "./context/mode";

type Tab = "home" | "schedule" | "log" | "progress" | "settings";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Idag", icon: House },
  { id: "schedule", label: "Schema", icon: CalendarDays },
  { id: "log", label: "Logg", icon: ClipboardList },
  { id: "progress", label: "Nivå", icon: LineChart },
  { id: "settings", label: "Mer", icon: SettingsIcon },
];

const GUEST_KEY = "vr_guest";

type SignIn = (email: string, password: string) => Promise<{ error: { message: string } | null }>;
type SignUp = (
  email: string,
  password: string
) => Promise<{ data: { user: unknown; session: unknown }; error: { message: string } | null }>;

export default function App() {
  const { session, ready, signIn, signUp } = useAuth();
  const [guest, setGuest] = useState<boolean>(
    () => sessionStorage.getItem(GUEST_KEY) === "1"
  );
  const [busy, setBusy] = useState(true);
  const [tab, setTab] = useState<Tab>("home");

  // Select the active database based on auth + guest state.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      if (session) {
        if (isGuestActive()) await exitGuestMode();
        else useRealDb();
        sessionStorage.removeItem(GUEST_KEY);
        if (!cancelled) {
          setGuest(false);
          setBusy(false);
        }
      } else if (guest) {
        await enterGuestMode();
        if (!cancelled) setBusy(false);
      } else {
        useRealDb();
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, session, guest]);

  const mode: "loading" | "landing" | "authed" | "guest" =
    !ready || busy ? "loading" : session ? "authed" : guest ? "guest" : "landing";

  function startGuest() {
    sessionStorage.setItem(GUEST_KEY, "1");
    setGuest(true);
  }
  async function exitGuest() {
    setBusy(true);
    await exitGuestMode();
    sessionStorage.removeItem(GUEST_KEY);
    setGuest(false);
    setBusy(false);
  }

  if (mode === "loading") {
    return (
      <div className="min-h-full grid place-items-center text-slate-400">Laddar…</div>
    );
  }

  if (mode === "landing") {
    return <Landing signIn={signIn} signUp={signUp} onGuest={startGuest} />;
  }

  return (
    <ModeContext.Provider value={{ isGuest: mode === "guest", exitGuest }}>
      <div className="min-h-full flex flex-col max-w-md mx-auto">
        <header className="safe-top sticky top-0 z-30 bg-ink-950/85 backdrop-blur border-b border-white/5">
          <div className="px-4 py-3 flex items-center gap-2">
            <div className="font-black tracking-tight text-lg">
              Sub<span className="text-brand">9</span>
            </div>
            <SyncBadge />
          </div>
        </header>

        {mode === "guest" && (
          <div className="bg-amber-500/15 text-amber-200 text-xs px-4 py-1.5 flex items-center justify-between border-b border-amber-500/20">
            <span>
              <b>Testläge</b> – inget sparas
            </span>
            <button className="underline font-medium" onClick={exitGuest}>
              Avsluta test
            </button>
          </div>
        )}

        <main key={mode} className="flex-1 overflow-y-auto pb-24">
          {tab === "home" && <Home onGoProgress={() => setTab("progress")} />}
          {tab === "schedule" && <Schedule />}
          {tab === "log" && <LogScreen />}
          {tab === "progress" && <Progress />}
          {tab === "settings" && <Settings />}
        </main>

        <nav className="fixed bottom-0 inset-x-0 z-30 max-w-md mx-auto safe-bottom bg-ink-950/90 backdrop-blur border-t border-white/10">
          <div className="grid grid-cols-5">
            {TABS.map((t) => {
              const active = t.id === tab;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                    active ? "text-brand" : "text-slate-500"
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </ModeContext.Provider>
  );
}

function SyncBadge() {
  const { email } = useAuth();
  const sync = useSyncState();
  const color = !email
    ? "#64748b"
    : sync.status === "error"
    ? "#f87171"
    : sync.status === "syncing"
    ? "#fbbf24"
    : sync.status === "offline"
    ? "#94a3b8"
    : "#34d399";
  const label = !email
    ? "Lokalt"
    : sync.status === "syncing"
    ? "Synkar"
    : sync.status === "error"
    ? "Fel"
    : sync.status === "offline"
    ? "Offline"
    : "Synkad";
  return (
    <div
      className="text-[11px] text-slate-400 ml-auto flex items-center gap-1.5"
      title={email ?? "Ej inloggad"}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function landingError(m: string): string {
  const s = m.toLowerCase();
  if (s.includes("invalid login")) return "Fel e-post eller lösenord.";
  if (s.includes("already registered") || s.includes("user already"))
    return "Det finns redan ett konto med den e-posten – tryck Logga in.";
  if (s.includes("password") && (s.includes("6") || s.includes("least") || s.includes("short")))
    return "Lösenordet måste vara minst 6 tecken.";
  if (s.includes("email") && s.includes("valid")) return "Ogiltig e-postadress.";
  if (s.includes("fetch") || s.includes("network"))
    return "Nätverksfel – kontrollera din uppkoppling.";
  return m;
}

function Landing({
  signIn,
  signUp,
  onGuest,
}: {
  signIn: SignIn;
  signUp: SignUp;
  onGuest: () => void;
}) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<"info" | "error">("info");
  const [busy, setBusy] = useState(false);

  async function doLogin() {
    const e = email.trim();
    if (!e || !pw) return;
    setBusy(true);
    setMsg("");
    const { error } = await signIn(e, pw);
    setBusy(false);
    if (error) {
      setKind("error");
      setMsg(landingError(error.message));
    }
  }
  async function doSignup() {
    const e = email.trim();
    if (!e || pw.length < 6) return;
    setBusy(true);
    setMsg("");
    const { data, error } = await signUp(e, pw);
    setBusy(false);
    if (error) {
      setKind("error");
      setMsg(landingError(error.message));
      return;
    }
    if (data.user && !data.session) {
      setKind("info");
      setMsg(
        "Konto skapat! Bekräfta din e-post via mejlet, eller be om att e-postbekräftelse stängs av i Supabase."
      );
    }
  }

  return (
    <div className="min-h-full flex flex-col justify-center max-w-md mx-auto p-6 safe-top safe-bottom">
      <div className="text-center mb-8">
        <div className="text-4xl font-black tracking-tight">
          Sub<span className="text-brand">9</span>
        </div>
        <div className="text-sm text-slate-400 mt-1">
          Vätternrundan · träning mot sub 9h
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          className="input"
          placeholder="din@mejl.se"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          autoComplete="current-password"
          className="input"
          placeholder="Lösenord (minst 6 tecken)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={doLogin}
            disabled={busy || !email.trim() || !pw}
          >
            Logga in
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={doSignup}
            disabled={busy || !email.trim() || pw.length < 6}
          >
            Skapa konto
          </button>
        </div>
        {msg && (
          <div className={`text-xs ${kind === "error" ? "text-red-300" : "text-emerald-300"}`}>
            {msg}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 my-5 text-slate-600 text-xs">
        <div className="h-px bg-white/10 flex-1" />
        eller
        <div className="h-px bg-white/10 flex-1" />
      </div>

      <button className="btn-ghost w-full" onClick={onGuest}>
        Testa utan konto
      </button>
      <p className="text-[11px] text-slate-500 text-center mt-2">
        Testläget sparar inget och synkas inte – perfekt för att prova appen.
      </p>
    </div>
  );
}
