import type { SessionType } from "./types";
import {
  Moon,
  Bike,
  Dumbbell,
  Gauge,
  Flame,
  Zap,
  Rocket,
  Route,
  Compass,
  Activity,
  Flag,
  Plus,
  type LucideIcon,
} from "lucide-react";

export interface SessionMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

export const SESSION_META: Record<SessionType, SessionMeta> = {
  rest: { label: "Vila", icon: Moon, color: "#94a3b8", bg: "#1e293b" },
  recovery: { label: "Återhämtning", icon: Bike, color: "#38bdf8", bg: "#0c2a3a" },
  strength: { label: "Styrka", icon: Dumbbell, color: "#a78bfa", bg: "#241b3a" },
  cadence: { label: "Kadens", icon: Gauge, color: "#22d3ee", bg: "#0c2f33" },
  tempo: { label: "Tempo", icon: Flame, color: "#f59e0b", bg: "#33240c" },
  threshold: { label: "Tröskel/FTP", icon: Zap, color: "#fb923c", bg: "#331d0c" },
  vo2: { label: "VO2max", icon: Rocket, color: "#ef4444", bg: "#340f0f" },
  long: { label: "Långpass", icon: Route, color: "#34d399", bg: "#0c3327" },
  endurance: { label: "Uthållighet", icon: Compass, color: "#4ade80", bg: "#0c3320" },
  intervals: { label: "Intervaller", icon: Activity, color: "#f472b6", bg: "#331021" },
  race: { label: "Lopp", icon: Flag, color: "#facc15", bg: "#33300c" },
  other: { label: "Annat", icon: Plus, color: "#cbd5e1", bg: "#1e293b" },
};

export function metaFor(t: SessionType): SessionMeta {
  return SESSION_META[t] ?? SESSION_META.other;
}

// "rest" is intentionally omitted: rest is inferred automatically when nothing
// is logged for a day, so it is never a manual choice.
export const SESSION_TYPE_OPTIONS: SessionType[] = [
  "recovery",
  "endurance",
  "long",
  "cadence",
  "tempo",
  "threshold",
  "vo2",
  "intervals",
  "strength",
  "other",
];
