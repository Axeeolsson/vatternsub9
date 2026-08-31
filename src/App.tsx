import { useState } from "react";
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

type Tab = "home" | "schedule" | "log" | "progress" | "settings";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Idag", icon: House },
  { id: "schedule", label: "Schema", icon: CalendarDays },
  { id: "log", label: "Logg", icon: ClipboardList },
  { id: "progress", label: "Nivå", icon: LineChart },
  { id: "settings", label: "Mer", icon: SettingsIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto">
      <header className="safe-top sticky top-0 z-30 bg-ink-950/85 backdrop-blur border-b border-white/5">
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="font-black tracking-tight text-lg">
            Sub<span className="text-brand">9</span>
          </div>
          <SyncBadge />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
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
      title={email ?? "Ej inloggad (endast lokalt)"}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}
