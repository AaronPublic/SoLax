"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SolarMap, { type DrawRequest, type MapFocus, type RoofSelection } from "@/components/SolarMap";
import ResultsPanel from "@/components/ResultsPanel";
import SavePlan from "@/components/SavePlan";
import Logo from "@/components/Logo";
import { useUser } from "@/lib/supabase/client";
import { sizeSystem } from "@/lib/sizing";
import type { PolygonGeometry } from "@/lib/geo";
import type { CalculateSolarRequest, CalculateSolarResponse, SavedPlanResponse } from "@/lib/types";
import styles from "./SolarPlanner.module.css";

const PRESETS = [300, 450, 800, 1200];
/** Same cap as the API's request schema (lib/calculate.ts). */
const MAX_KWH = 100_000;
const KWH_INPUT_ID = "kwh";
const RESULTS_ID = "plan-results";
/** Wait for typing to pause before calculating, so "450" doesn't also run for "4" and "45". */
const KWH_TYPING_PAUSE_MS = 700;
/** Roof + usage kept across the login redirect so a guest can save after signing in. */
const PENDING_KEY = "solar:pendingPlan";

interface PendingPlan {
  roof: RoofSelection;
  kwh: string;
}

export default function SolarPlanner() {
  const router = useRouter();
  const params = useSearchParams();
  const user = useUser();

  const [kwhInput, setKwhInput] = useState("");
  const [roof, setRoof] = useState<RoofSelection | null>(null);
  const [fit, setFit] = useState<CalculateSolarResponse | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  /** The plan as last saved (or opened); it counts as saved only while the usage is unchanged. */
  const [saved, setSaved] = useState<{ name: string; kwh: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A roof was picked (or drawn) before any usage figure was entered. */
  const [awaitingKwh, setAwaitingKwh] = useState(false);
  /** The roof outline tool, when open. */
  const [draw, setDraw] = useState<DrawRequest | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const monthlyKwh = Number(kwhInput);
  const kwhEntered = kwhInput.trim() !== "";
  const kwhValid = kwhEntered && Number.isFinite(monthlyKwh) && monthlyKwh > 0 && monthlyKwh <= MAX_KWH;
  const kwhError =
    kwhEntered && !kwhValid
      ? monthlyKwh > MAX_KWH
        ? `Enter at most ${MAX_KWH.toLocaleString()} kWh.`
        : "Enter a number above 0."
      : null;
  const savedName = saved && kwhValid && saved.kwh === monthlyKwh ? saved.name : null;

  // The API returns every panel slot plus a 1 kWp yield profile, so re-sizing for a new
  // consumption figure happens here, instantly, without another request.
  const sizing = useMemo(
    () => (fit && kwhValid ? sizeSystem(monthlyKwh, fit.maxPanels, fit.monthlyKwhPerKw) : null),
    [fit, kwhValid, monthlyKwh],
  );

  const calculate = useCallback(async (selection: RoofSelection, kwh: number) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setRoof(selection);
    setFit(null);
    setSaved(null);
    setError(null);
    setLoading(true);

    try {
      const body: CalculateSolarRequest = { geometry: selection.geometry, monthlyKwh: kwh, osmId: selection.osmId };
      const res = await fetch("/api/calculate-solar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setFit(data as CalculateSolarResponse);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, []);

  const handleSelect = useCallback(
    (selection: RoofSelection) => {
      if (!kwhValid) {
        // Keep the roof; the effect below calculates as soon as a usage figure is entered.
        requestRef.current?.abort();
        setRoof(selection);
        setFit(null);
        setSaved(null);
        setError(null);
        setLoading(false);
        setAwaitingKwh(true);
        return;
      }
      setAwaitingKwh(false);
      void calculate(selection, monthlyKwh);
    },
    [calculate, kwhValid, monthlyKwh],
  );

  // A roof picked before the usage was entered: calculate once typing pauses.
  useEffect(() => {
    if (!awaitingKwh || !kwhValid || !roof) return;
    const timer = setTimeout(() => {
      setAwaitingKwh(false);
      void calculate(roof, monthlyKwh);
    }, KWH_TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [awaitingKwh, kwhValid, monthlyKwh, roof, calculate]);

  const startDrawing = (initial: PolygonGeometry | null) => setDraw({ initial, key: `draw-${Date.now()}` });
  const finishDrawing = (geometry: PolygonGeometry) => {
    setDraw(null);
    handleSelect({ osmId: `drawn/${Date.now()}`, geometry });
  };

  // Open a saved plan (?plan=<id>) or restore the roof a guest picked before logging in (?resume=1).
  const planId = params.get("plan");
  const resume = params.get("resume");
  useEffect(() => {
    let cancelled = false;

    if (planId) {
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(`/api/plans/${encodeURIComponent(planId)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? `Couldn't open the plan (${res.status})`);
          if (cancelled) return;
          const plan = data as SavedPlanResponse;
          const selection = { osmId: plan.osmId ?? `plan/${plan.id}`, geometry: plan.footprint };
          setKwhInput(String(plan.targetMonthlyKwh));
          setRoof(selection);
          setFit(plan.result);
          setSaved({ name: plan.name, kwh: plan.targetMonthlyKwh });
          setFocus({ geometry: plan.footprint, key: plan.id });
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't open the plan");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    } else if (resume) {
      let pending: PendingPlan | null = null;
      try {
        pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        // Storage unavailable (private mode): nothing to restore.
      }
      if (pending?.roof?.geometry && Number(pending.kwh) > 0) {
        // Restoring state from browser storage on first load is a real external sync.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setKwhInput(pending.kwh);
        setFocus({ geometry: pending.roof.geometry, key: `resume-${pending.roof.osmId}` });
        void calculate(pending.roof, Number(pending.kwh));
      }
      router.replace("/plan", { scroll: false });
    }

    return () => {
      cancelled = true;
    };
  }, [planId, resume, calculate, router]);

  const clearSelection = () => {
    requestRef.current?.abort();
    setRoof(null);
    setFit(null);
    setSaved(null);
    setError(null);
    setLoading(false);
    setAwaitingKwh(false);
    setDraw(null);
    if (planId) router.replace("/plan", { scroll: false });
  };

  /** Remember the current roof, then send a guest to log in / register and back. */
  const authHref = (path: "/login" | "/register") => `${path}?next=${encodeURIComponent("/plan?resume=1")}`;
  const rememberForLogin = () => {
    if (!roof) return;
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ roof, kwh: kwhInput } satisfies PendingPlan));
    } catch {
      // Without storage the user just picks the roof again after logging in.
    }
  };

  const steps = [
    { label: "Usage", done: kwhValid },
    { label: "Roof", done: roof !== null },
    { label: "Save", done: savedName !== null },
  ];

  const retry = roof && kwhValid ? () => void calculate(roof, monthlyKwh) : undefined;

  // Small screens put the sidebar below the map, so the map carries a one-line summary and a
  // shortcut to the part of the sidebar that needs attention.
  let mapSummary: ReactNode = null;
  if (!draw) {
    if (loading) {
      mapSummary = (
        <MapCard>
          <span className={styles.mapSpinner} aria-hidden="true" />
          Calculating…
        </MapCard>
      );
    } else if (error) {
      mapSummary = (
        <MapCard action="See why" onAction={() => reveal(RESULTS_ID)} tone="warn">
          Something went wrong.
        </MapCard>
      );
    } else if (!kwhValid) {
      mapSummary = (
        <MapCard action="Enter usage" onAction={() => reveal(KWH_INPUT_ID, true)}>
          {roof ? "Roof selected. Now enter your monthly usage." : "Start with your monthly usage, then tap your roof."}
        </MapCard>
      );
    } else if (!roof) {
      mapSummary = <MapCard>Tap your roof when it&apos;s outlined.</MapCard>;
    } else if (fit?.maxPanels === 0) {
      mapSummary = <MapCard tone="warn">No full-size panel fits on this roof.</MapCard>;
    } else if (fit && sizing) {
      mapSummary = (
        <MapCard action="Details" onAction={() => reveal(RESULTS_ID)}>
          <span>
            <strong>{sizing.recommendedPanels} panels</strong> · {sizing.systemCapacityKw.toFixed(2)} kWp ·{" "}
            ≈{Math.round(sizing.estMonthlyKwh).toLocaleString()} kWh/mo
          </span>
        </MapCard>
      );
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <header className={styles.brand}>
          <Logo />
          {user === undefined ? null : user ? (
            <Link href="/plans" className={styles.account}>
              My plans
            </Link>
          ) : (
            <Link href="/login?next=/plan" className={styles.account}>
              Log in
            </Link>
          )}
        </header>

        <ol className={styles.steps} aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.label} className={styles.step} aria-current={!s.done && steps.slice(0, i).every((p) => p.done) ? "step" : undefined}>
              <span className={s.done ? styles.stepDone : styles.stepTodo}>
                {s.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="done">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              {s.label}
            </li>
          ))}
        </ol>

        <section className={styles.field}>
          <label htmlFor={KWH_INPUT_ID} className={styles.label}>
            Monthly consumption
          </label>
          {/* Highlighted while a picked roof is waiting for a usage figure. */}
          <div className={roof && !kwhValid && !draw ? `${styles.inputBox} ${styles.inputBoxAttention}` : styles.inputBox}>
            <input
              id={KWH_INPUT_ID}
              type="number"
              inputMode="decimal"
              min={1}
              max={MAX_KWH}
              step={10}
              aria-invalid={kwhError ? true : undefined}
              aria-describedby="kwh-hint"
              placeholder="e.g. 450"
              value={kwhInput}
              onChange={(e) => setKwhInput(e.target.value)}
            />
            <span className={styles.unit}>kWh / month</span>
          </div>
          <div className={styles.presets}>
            {PRESETS.map((n) => {
              const active = kwhValid && monthlyKwh === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                  aria-pressed={active}
                  onClick={() => setKwhInput(String(n))}
                >
                  {n.toLocaleString()} kWh
                </button>
              );
            })}
          </div>
          <p id="kwh-hint" className={kwhError ? `${styles.hint} ${styles.hintError}` : styles.hint}>
            {kwhError ?? "Find it on your electric bill under “Total kWh used”."}
          </p>
        </section>

        {draw ? (
          <p className={styles.prompt}>
            Trace your roof on the map using the instructions in its top-left corner, or press Cancel to go back.
          </p>
        ) : roof ? (
          <section className={styles.roofCard}>
            <div className={styles.roofRow}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11l9-7 9 7" />
                <path d="M5 10v10h14V10" />
              </svg>
              <div className={styles.roofText}>
                <span className={styles.roofTitle}>
                  {saved?.name ?? (roof.osmId.startsWith("drawn/") ? "Your drawn roof" : "Selected roof")}
                </span>
                <span className={styles.roofMeta}>
                  {fit
                    ? `${Math.round(fit.roofAreaM2).toLocaleString()} m² footprint · ${fit.maxPanels} panel slots`
                    : awaitingKwh
                      ? "Enter your monthly usage above to calculate."
                      : loading
                        ? "Calculating…"
                        : "Not calculated"}
                </span>
              </div>
            </div>
            <div className={styles.roofActions}>
              <button type="button" className={styles.ghostButton} onClick={() => startDrawing(roof.geometry)}>
                Adjust outline
              </button>
              <button type="button" className={styles.ghostButton} onClick={clearSelection}>
                Change roof
              </button>
            </div>
          </section>
        ) : (
          !loading && (
            <div className={styles.prompt}>
              <p className={styles.promptText}>
                {kwhValid
                  ? "Now hover over the map and click your roof when it lights up."
                  : "Enter your usage, then click your roof on the map."}
              </p>
              <p className={styles.promptText}>
                Roof not highlighted, or its outline is wrong?{" "}
                <button type="button" className={styles.inlineButton} onClick={() => startDrawing(null)}>
                  Draw my roof
                </button>
              </p>
            </div>
          )
        )}

        <div id={RESULTS_ID} className={styles.results}>
          <ResultsPanel
            fit={fit}
            sizing={sizing}
            targetKwh={kwhValid ? monthlyKwh : null}
            loading={loading}
            error={error}
            onRetry={retry}
          />

          {fit && sizing && roof && fit.maxPanels > 0 && (
            <SavePlan
              user={user}
              roof={roof}
              monthlyKwh={monthlyKwh}
              savedName={savedName}
              defaultName={saved?.name}
              onSaved={(name) => setSaved({ name, kwh: monthlyKwh })}
              loginHref={authHref("/login")}
              registerHref={authHref("/register")}
              onBeforeAuth={rememberForLogin}
            />
          )}
        </div>

        <p className={styles.fineprint}>
          Estimates from NREL PVWatts v8 with 14% system losses, 15° tilt facing south. Roof outlines come from
          OpenStreetMap and may not match the actual roof; shading and roof pitch are not modelled.
        </p>
      </aside>

      <main className={styles.mapArea}>
        <SolarMap
          panels={fit?.panels ?? null}
          recommendedCount={sizing?.recommendedPanels ?? 0}
          roof={roof?.geometry ?? null}
          focus={focus}
          onSelect={handleSelect}
          draw={draw}
          onDrawDone={finishDrawing}
          onDrawCancel={() => setDraw(null)}
          overlay={mapSummary}
        />
      </main>
    </div>
  );
}

function MapCard({
  children,
  action,
  onAction,
  tone,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  tone?: "warn";
}) {
  return (
    <div className={tone === "warn" ? `${styles.mapCard} ${styles.mapCardWarn}` : styles.mapCard} role="status">
      <div className={styles.mapCardText}>{children}</div>
      {action && onAction && (
        <button type="button" className={styles.mapCardAction} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

/** Scrolls the sidebar section into view (below the map on small screens), optionally focusing it. */
function reveal(id: string, focus = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: focus ? "center" : "start" });
  if (focus) el.focus({ preventScroll: true });
}
