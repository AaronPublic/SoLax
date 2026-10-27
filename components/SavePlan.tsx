"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { RoofSelection } from "@/components/SolarMap";
import type { BrowserUser } from "@/lib/supabase/client";
import styles from "./SavePlan.module.css";

interface Props {
  /** `undefined` while the session is loading. */
  user: BrowserUser | null | undefined;
  roof: RoofSelection;
  monthlyKwh: number;
  /** Name it's saved under, if this exact roof + usage is already saved. */
  savedName: string | null;
  defaultName?: string;
  onSaved: (name: string) => void;
  loginHref: string;
  registerHref: string;
  /** Called before a guest leaves for login/register, to keep the roof for afterwards. */
  onBeforeAuth: () => void;
}

export default function SavePlan({ user, roof, monthlyKwh, savedName, defaultName, onSaved, loginHref, registerHref, onBeforeAuth }: Props) {
  const [name, setName] = useState(defaultName ?? "My home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user === undefined) return null;

  if (!user) {
    return (
      <section className={styles.box}>
        <h2 className={styles.heading}>Save this plan</h2>
        <p className={styles.text}>Create a free account to keep this plan and compare it with others later.</p>
        <div className={styles.row}>
          <Link href={registerHref} className={styles.primary} onClick={onBeforeAuth}>
            Create account
          </Link>
          <Link href={loginHref} className={styles.secondary} onClick={onBeforeAuth}>
            Log in
          </Link>
        </div>
      </section>
    );
  }

  if (savedName) {
    return (
      <section className={`${styles.box} ${styles.saved}`} role="status">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5L20 7" />
        </svg>
        <p className={styles.text}>
          Saved as <strong>{savedName}</strong>. <Link href="/plans">View my plans</Link>
        </p>
      </section>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, geometry: roof.geometry, monthlyKwh, osmId: roof.osmId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't save (${res.status})`);
      onSaved(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.box} onSubmit={onSubmit}>
      <label htmlFor="plan-name" className={styles.heading}>
        Save this plan
      </label>
      <div className={styles.row}>
        <input
          id="plan-name"
          className={styles.input}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Plan name"
        />
        <button type="submit" className={styles.primary} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
