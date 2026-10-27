"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabaseEnv } from "@/lib/supabase/env";

let client: SupabaseClient | undefined;

/** Singleton Supabase client for Client Components. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createBrowserClient(url, key);
  }
  return client;
}

export interface BrowserUser {
  id: string;
  email: string | null;
}

/** Current user for UI purposes (`undefined` while loading). Server routes re-verify on every request. */
export function useUser(): BrowserUser | null | undefined {
  const [user, setUser] = useState<BrowserUser | null | undefined>(undefined);

  useEffect(() => {
    let supabase: SupabaseClient;
    try {
      supabase = getSupabase();
    } catch (err) {
      // Auth not configured yet: behave as signed out instead of breaking the planner.
      console.warn(err);
      queueMicrotask(() => setUser(null));
      return;
    }
    const toUser = (u: { id: string; email?: string | null } | null | undefined) =>
      u ? { id: u.id, email: u.email ?? null } : null;

    supabase.auth.getUser().then(({ data }) => setUser(toUser(data.user)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }, []);

  return user;
}
