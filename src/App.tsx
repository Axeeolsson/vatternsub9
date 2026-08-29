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
          <div className="text-xs text-slate-500 ml-auto">Vätternrundan 2027</div>
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
