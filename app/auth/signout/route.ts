import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST-only so a link or prefetch can't log someone out. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err) {
    // Still send the user home; with auth misconfigured there's no session to end anyway.
    console.error("[auth/signout]", err);
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
