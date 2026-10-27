import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

/**
 * Landing point for Supabase email links (sign-up confirmation). Exchanges the one-time code for a
 * session cookie, then continues to `next`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    console.error("[auth/callback]", error.message);
  }

  const login = new URL("/login", url.origin);
  login.searchParams.set("error", "That confirmation link is invalid or has expired. Log in or register again.");
  return NextResponse.redirect(login);
}
