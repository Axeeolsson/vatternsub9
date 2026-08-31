import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../db/supabase";
import {
  getSyncState,
  subscribeSync,
  syncNow,
  type SyncState,
} from "../db/sync";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signUp(email: string, password: string) {
    return supabase.auth.signUp({ email, password });
  }
  async function signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  }
  async function signOut() {
    return supabase.auth.signOut();
  }

  return {
    session,
    email: session?.user?.email ?? null,
    ready,
    signUp,
    signIn,
    signOut,
  };
}

export function useSyncState(): SyncState & { syncNow: typeof syncNow } {
  const [s, setS] = useState<SyncState>(getSyncState());
  useEffect(() => subscribeSync(setS), []);
  return { ...s, syncNow };
}
