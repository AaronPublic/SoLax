"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";
import styles from "./AuthForm.module.css";

type Mode = "login" | "register";

const MIN_PASSWORD = 8;

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sentTo, setSentTo] = useState<string | null>(null);

  const isRegister = mode === "register";
  const otherHref = `${isRegister ? "/login" : "/register"}${next !== "/plans" ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isRegister && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabase();
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation is off in Supabase: the account is ready.
          router.replace(next);
          router.refresh();
          return;
        }
        setSentTo(email);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }
    } catch (err) {
      setError(friendlyError(err));
    }
    setBusy(false);
  }

  if (sentTo) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>Check your email</h1>
        <p className={styles.text}>
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it on this device to finish creating your
          account. You&apos;ll come right back here.
        </p>
        <p className={styles.small}>
          No email after a few minutes? Check your spam folder, or{" "}
          <button type="button" className={styles.linkButton} onClick={() => setSentTo(null)}>
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate>
      <div>
        <h1 className={styles.title}>{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className={styles.text}>
          {isRegister ? "Save your solar plans and come back to them anytime." : "Log in to see and save your solar plans."}
        </p>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? MIN_PASSWORD : undefined}
          aria-describedby={isRegister ? "password-hint" : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isRegister && (
          <span id="password-hint" className={styles.hint}>
            At least {MIN_PASSWORD} characters.
          </span>
        )}
      </div>

      <button type="submit" className={styles.submit} disabled={busy || !email || !password}>
        {busy ? "Please wait…" : isRegister ? "Create account" : "Log in"}
      </button>

      <p className={styles.switch}>
        {isRegister ? "Already have an account?" : "New here?"} <Link href={otherHref}>{isRegister ? "Log in" : "Create an account"}</Link>
      </p>
    </form>
  );
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/NEXT_PUBLIC_SUPABASE/.test(message)) return "Sign-in isn't configured yet: add the Supabase URL and publishable key to .env.";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match an account.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first: open the link we sent you.";
  if (/already registered|already been registered/i.test(message)) return "An account with this email already exists. Log in instead.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/valid email|invalid email|email address .* invalid/i.test(message)) return "Enter a valid email address.";
  if (/password/i.test(message)) return message;
  return "Something went wrong. Please try again.";
}
