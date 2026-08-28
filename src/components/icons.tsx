import type { SessionType, LoggedSession } from "../lib/types";
import { metaFor } from "../lib/sessionMeta";
import { activityById } from "../lib/logFields";

/** Modern line icon for a planned/session type (Lucide). */
export function SessionIcon({
  type,
  size = 20,
  color,
  className,
  strokeWidth = 2,
}: {
  type: SessionType;
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = metaFor(type).icon;
  return <Icon size={size} color={color} className={className} strokeWidth={strokeWidth} />;
}

/** Icon for a logged session: activity icon for "Annat", else the type icon. */
export function LoggedIcon({
  session,
  size = 18,
  color,
  className,
  strokeWidth = 2,
}: {
  session: LoggedSession;
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon =
    session.sessionType === "other"
      ? activityById(session.activity)?.icon ?? metaFor("other").icon
      : metaFor(session.sessionType).icon;
  return <Icon size={size} color={color} className={className} strokeWidth={strokeWidth} />;
}
