import { useLiveQuery } from "dexie-react-hooks";
import { db, DEFAULT_SETTINGS } from "../db/db";
import type { EngineState } from "../lib/planEngine";

export function useEngineState(): EngineState | undefined {
  const planned = useLiveQuery(() => db.plannedSessions.toArray(), []);
  const logged = useLiveQuery(() => db.loggedSessions.toArray(), []);
  const ftps = useLiveQuery(() => db.ftpTests.orderBy("date").toArray(), []);
  const settings = useLiveQuery(() => db.settings.get("singleton"), []);

  if (!planned || !logged || !ftps) return undefined;
  return {
    planned,
    logged,
    ftps,
    settings: settings ?? DEFAULT_SETTINGS,
  };
}
