import { createContext, useContext } from "react";

export interface ModeContextValue {
  isGuest: boolean;
  exitGuest: () => void | Promise<void>;
}

export const ModeContext = createContext<ModeContextValue>({
  isGuest: false,
  exitGuest: () => {},
});

export function useMode(): ModeContextValue {
  return useContext(ModeContext);
}
