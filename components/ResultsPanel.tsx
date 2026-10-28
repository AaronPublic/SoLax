import type { CSSProperties } from "react";
import type { Sizing } from "@/lib/sizing";
import type { CalculateSolarResponse } from "@/lib/types";
import styles from "./ResultsPanel.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number, dp = 0) => n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp });

interface Props {
  fit: CalculateSolarResponse | null;
  sizing: Sizing | null;
  targetKwh: number | null;
  loading: boolean;
  error: string | null;
  /** Runs the failed calculation again; omitted when there's nothing to retry. */
  onRetry?: () => void;
}

export default function ResultsPanel({ fit, sizing, targetKwh, loading, error, onRetry }: Props) {
  if (error) {
    return (
      <div className={styles.error} role="alert">
        <p>{error}</p>
        {onRetry && (
          <button type="button" className={styles.retry} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (loading) {
    return (
      <p className={styles.loading} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        Fitting panels and running PVWatts…
      </p>
    );
  }
  if (!fit) return null;

  if (fit.maxPanels === 0) {
    return <p className={styles.notice}>{fit.message ?? "No full-size panel fits on this roof."}</p>;
  }
  if (!sizing || targetKwh === null) {
    return <p className={styles.notice}>Enter your monthly consumption to size a system for this roof.</p>;
  }

  const coverage = Math.round(sizing.coveragePct);
  const meets = coverage >= 100;
  const peak = Math.max(...sizing.monthlyKwh, targetKwh, 1);
  const targetLeft = `${(targetKwh / peak) * 100}%`;

  return (
    <div className={styles.results}>
      {sizing.neededPanels > fit.maxPanels && (
        <p className={styles.warning}>
          The roof fits {fit.maxPanels} panels; about {sizing.neededPanels} would be needed to cover your full usage.
        </p>
      )}

      <dl className={styles.stats}>
        <Stat label="Panels" value={String(sizing.recommendedPanels)} sub={`of ${fit.maxPanels} that fit`} />
        <Stat label="System size" value={fmt(sizing.systemCapacityKw, 2)} unit="kWp" sub={`roof max ${fmt(sizing.maxSystemKw, 1)} kWp`} />
        <Stat label="Est. production" value={fmt(sizing.estMonthlyKwh)} unit="kWh" sub="per month, average" />
        <Stat label="Covers" value={`${fmt(coverage)}%`} sub="of your usage" tone={meets ? "ok" : "warn"} />
      </dl>

      <section className={styles.chart}>
        <div className={styles.chartHead}>
          <h2 className={styles.heading}>Monthly production</h2>
          <span className={styles.legend}>
            <span className={styles.legendMark} aria-hidden="true" />
            your usage
          </span>
        </div>
        <ul className={styles.bars} aria-label="Estimated production by month">
          {sizing.monthlyKwh.map((kwh, i) => (
            <li key={MONTHS[i]} style={{ "--i": i } as CSSProperties}>
              <span className={styles.month}>{MONTHS[i]}</span>
              <span className={styles.track} style={{ "--target": targetLeft } as CSSProperties}>
                <span className={styles.bar} style={{ transform: `scaleX(${kwh / peak})` }} />
              </span>
              <span className={styles.value}>{fmt(kwh)}</span>
            </li>
          ))}
        </ul>
      </section>

      <dl className={styles.details}>
        <dt>Annual output</dt>
        <dd>{fmt(sizing.annualKwh)} kWh</dd>
        <dt>Roof capacity</dt>
        <dd>
          {fmt(sizing.maxSystemKw, 2)} kWp ≈ {fmt(sizing.maxMonthlyKwh)} kWh/mo
        </dd>
        <dt>Array</dt>
        <dd>
          {fit.tiltDeg}° tilt, {fit.azimuthDeg}° azimuth
        </dd>
        {fit.weatherStation && (
          <>
            <dt>Weather data</dt>
            <dd>{fit.weatherStation}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function Stat({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd className={`${styles.statValue} ${tone ? styles[tone] : ""}`}>
        {value}
        {unit && <span className={styles.statUnit}> {unit}</span>}
      </dd>
      <dd className={styles.statSub}>{sub}</dd>
    </div>
  );
}
