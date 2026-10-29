"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/page.module.css";

// NREL PVWatts v8 monthly yield per 1 kWp in Metro Manila (14.60° N, 120.98° E, 15° S tilt, 14% losses)
const MANILA_KWH_PER_KWP = [124, 131, 148, 152, 141, 119, 108, 104, 110, 121, 122, 120];
const ANNUAL_PER_KWP = MANILA_KWH_PER_KWP.reduce((a, b) => a + b, 0); // 1500 kWh/kWp/yr
const MONTHLY_AVG_PER_KWP = ANNUAL_PER_KWP / 12; // 125 kWh/kWp/mo
const PANEL_KW = 0.55;
const PANEL_AREA_M2 = 2.58; // 2.28 m × 1.13 m
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLS = 7;
const ROWS = 6;
const TOTAL_SLOTS = COLS * ROWS; // 42 slots on the sample 108 m² roof

// Rank slots from the ridge/centre outward, matching lib/panel-Debug/sizing
const RANKED_SLOTS = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
  const dx = ((i % COLS) - (COLS - 1) / 2) * 2.28;
  const dy = (Math.floor(i / COLS) - (ROWS - 1) / 2) * 1.13;
  return { i, dist: dx * dx + dy * dy };
})
  .sort((a, b) => a.dist - b.dist)
  .map((s) => s.i);

export function ScrollRevealInit() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(styles.isIn);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

export function HeroRoofFragment() {
  const [kwh, setKwh] = useState(450);
  const [customToggle, setCustomToggle] = useState<number | null>(null);

  const neededPanels = Math.min(
    TOTAL_SLOTS,
    Math.max(1, Math.ceil(kwh / (PANEL_KW * MONTHLY_AVG_PER_KWP))),
  );
  const activeCount = customToggle ?? neededPanels;
  const activeSet = new Set(RANKED_SLOTS.slice(0, activeCount));
  const systemKw = activeCount * PANEL_KW;
  const estMonthly = Math.round(systemKw * MONTHLY_AVG_PER_KWP);
  const coverage = Math.min(999, Math.round((estMonthly / Math.max(kwh, 1)) * 100));

  return (
    <div className={styles.heroUi} data-ui>
      <div className={styles.heroUiHeader}>
        <div>
          <p className={styles.uiTitle}>Sample roof · Quezon City, Metro Manila</p>
          <p className={styles.uiSub}>108 m² gable footprint · 0.5 m perimeter setback · 15° south tilt</p>
        </div>
        <span className={styles.uiBadge}>{activeCount} of 42 slots active</span>
      </div>

      <div className={styles.roofCanvas} role="group" aria-label="Interactive 42-slot roof array">
        <div className={styles.roofSetbackLabel}>0.5 m clear edge</div>
        <div className={styles.roofSlotsGrid}>
          {Array.from({ length: TOTAL_SLOTS }, (_, idx) => {
            const on = activeSet.has(idx);
            return (
              <button
                key={idx}
                type="button"
                className={on ? `${styles.roofSlot} ${styles.roofSlotOn}` : styles.roofSlot}
                aria-pressed={on}
                aria-label={`Roof slot ${idx + 1}, ${on ? "550 W panel installed" : "empty slot"}`}
                onClick={() => {
                  const next = on ? Math.max(1, activeCount - 1) : Math.min(TOTAL_SLOTS, activeCount + 1);
                  setCustomToggle(next);
                }}
              />
            );
          })}
        </div>
      </div>

      <div className={styles.heroUiControls}>
        <div className={styles.uiPresetRow}>
          <span className={styles.uiLabel}>Monthly bill target</span>
          <div className={styles.uiPresetGroup}>
            {[300, 450, 800, 1200].map((preset) => {
              const selected = kwh === preset && customToggle === null;
              return (
                <button
                  key={preset}
                  type="button"
                  className={selected ? `${styles.uiChip} ${styles.uiChipActive}` : styles.uiChip}
                  aria-pressed={selected}
                  onClick={() => {
                    setKwh(preset);
                    setCustomToggle(null);
                  }}
                >
                  {preset} kWh
                </button>
              );
            })}
          </div>
        </div>

        <dl className={styles.uiMetricsRow}>
          <div>
            <dt>Recommended array</dt>
            <dd>
              {activeCount} panels · {systemKw.toFixed(2)} kWp
            </dd>
          </div>
          <div>
            <dt>Est. output</dt>
            <dd>{estMonthly.toLocaleString()} kWh / mo</dd>
          </div>
          <div>
            <dt>Bill offset</dt>
            <dd className={coverage >= 100 ? styles.uiOk : styles.uiWarn}>{coverage}%</dd>
          </div>
        </dl>

        <div className={styles.uiFooterRow}>
          <span className={styles.uiHint}>Click any roof slot or bill preset to resize the array.</span>
          <Link href={`/plan?kwh=${kwh}`} className={styles.uiActionLink}>
            Use {kwh} kWh on map →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ShowcaseBillSizer() {
  const [raw, setRaw] = useState("450");
  const parsed = Math.min(10000, Math.max(50, Number(raw.replace(/[^0-9]/g, "")) || 450));
  const panels = Math.max(1, Math.ceil(parsed / (PANEL_KW * MONTHLY_AVG_PER_KWP)));
  const kw = panels * PANEL_KW;
  const roofAreaNeeded = Math.ceil((panels * PANEL_AREA_M2) / 0.72);
  const aprilPeak = Math.round(kw * MANILA_KWH_PER_KWP[3]);
  const augustLow = Math.round(kw * MANILA_KWH_PER_KWP[7]);
  const annualKwh = Math.round(kw * ANNUAL_PER_KWP);

  return (
    <div className={styles.showcaseGrid}>
      <div className={styles.showcaseLeft} data-reveal>
        <div className={styles.typeInputWrap} data-ui>
          <label htmlFor="bill-kwh-input" className={styles.uiLabel}>
            Type your monthly electric bill usage (kWh)
          </label>
          <div className={styles.typeInputRow}>
            <input
              id="bill-kwh-input"
              type="text"
              inputMode="numeric"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className={styles.typeHeadlineInput}
              aria-label="Monthly electricity usage in kilowatt-hours"
            />
            <span className={styles.typeUnit}>kWh / mo</span>
          </div>
          <div className={styles.typePresets}>
            {[
              { label: "Small home · 300 kWh", val: "300" },
              { label: "Family home · 450 kWh", val: "450" },
              { label: "3 AC units · 800 kWh", val: "800" },
              { label: "Large residence · 1200 kWh", val: "1200" },
            ].map((item) => (
              <button
                key={item.val}
                type="button"
                className={raw === item.val ? `${styles.uiChip} ${styles.uiChipActive}` : styles.uiChip}
                onClick={() => setRaw(item.val)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.answerCard} data-ui>
          <div className={styles.answerRow}>
            <span>550 W monocrystalline modules</span>
            <strong>
              {panels} panels ({kw.toFixed(2)} kWp)
            </strong>
          </div>
          <div className={styles.answerRow}>
            <span>Minimum roof footprint (with 0.5 m setback)</span>
            <strong>{roofAreaNeeded} m²</strong>
          </div>
          <div className={styles.answerRow}>
            <span>Dry-season peak (April) vs. Habagat low (August)</span>
            <strong>
              {aprilPeak.toLocaleString()} kWh / {augustLow.toLocaleString()} kWh
            </strong>
          </div>
          <div className={styles.answerRow}>
            <span>Estimated annual generation (NREL PVWatts v8)</span>
            <strong>{annualKwh.toLocaleString()} kWh / yr</strong>
          </div>
          <div className={styles.answerFooter}>
            <Link href={`/plan?kwh=${parsed}`} className={styles.primaryButton}>
              Fit {panels} panels on my roof
            </Link>
          </div>
        </div>
      </div>

      <figure className={styles.showcaseRight} data-reveal>
        <img
          src="/assets/solar-panels-on-a-roof.jpg"
          width={1920}
          height={975}
          alt="Close view of monocrystalline solar modules mounted on a pitched residential roof under clear daylight"
          loading="lazy"
          decoding="async"
          className={styles.showcasePhoto}
        />
        <figcaption className={styles.photoCaption}>
          Each 550 W module occupies 2.28 m × 1.13 m (2.58 m²). The planner leaves a 0.5 m clear perimeter along every
          roof edge before placing panels.
        </figcaption>
      </figure>
    </div>
  );
}

const STAGES = [
  {
    name: "Enter monthly kWh",
    clause: "Read the total kWh line from your electric bill.",
    body: "Enter the monthly kilowatt-hours printed on your Meralco or electric cooperative statement, or pick a household preset. Changing this figure resizes your array instantly without re-querying the server.",
    photo: "/assets/solar-panels-on-metal-roof.jpg",
    photoAlt: "Solar panel array fitted across a standing-seam metal roof with perimeter clearance",
  },
  {
    name: "Select roof outline",
    clause: "Click your house on the satellite map or trace its eaves.",
    body: "Building outlines from OpenStreetMap highlight as you move across the map. If your subdivision is newer or a tree overhangs one eave, draw or adjust the polygon vertices directly on the satellite tile.",
    photo: "/assets/solar-panels-on-church-roof-full.jpg",
    photoAlt: "Contiguous rooftop photovoltaic array aligned to the long ridge of a pitched building",
  },
  {
    name: "Fit 550 W modules",
    clause: "We align 2.28 × 1.13 m panels to your roof’s longest ridge.",
    body: "The geometry engine shrinks your roof footprint by 0.5 m on every side for wind and maintenance clearance, rotates the grid to the dominant roof edge, and packs 550 W modules from the centre outward.",
    photo: "/assets/solar-panels-on-a-roof.jpg",
    photoAlt: "Pitched roof solar array showing individual framed monocrystalline modules",
  },
  {
    name: "Read 12-month yield",
    clause: "See every month’s kWh output across dry and monsoon seasons.",
    body: "Using NREL PVWatts v8 satellite solar irradiance for your coordinates in the Philippines, the planner compares each month’s production against your bill from April summer highs to August Habagat rains.",
    photo: "/assets/moody-metro-manila.jpg",
    photoAlt: "Metro Manila skyline and residential rooftops under tropical monsoon clouds and breaking sunlight",
  },
];

export function StagesExplorer() {
  const [stage, setStage] = useState(0);
  const current = STAGES[stage];

  return (
    <div className={styles.stagesWrap}>
      <div className={styles.stagesSplit}>
        <div className={styles.stagesLeft} data-reveal>
          <p className={styles.stageHeadline}>{current.clause}</p>
          <p className={styles.stageBody}>{current.body}</p>
          <figure className={styles.stageFigure}>
            <img
              src={current.photo}
              width={1920}
              height={1280}
              alt={current.photoAlt}
              loading="lazy"
              decoding="async"
              className={styles.stagePhoto}
            />
          </figure>
        </div>

        <div className={styles.stagesRight} data-reveal>
          <div className={styles.stageFragment} data-ui>
            {stage === 0 && (
              <div className={styles.fragPane}>
                <p className={styles.uiTitle}>Step 1 · Monthly consumption input</p>
                <div className={styles.fragInputDemo}>
                  <span className={styles.fragInputNumber}>450</span>
                  <span className={styles.uiSub}>kWh / month</span>
                </div>
                <div className={styles.uiPresetGroup}>
                  <span className={styles.uiChip}>300 kWh</span>
                  <span className={`${styles.uiChip} ${styles.uiChipActive}`}>450 kWh</span>
                  <span className={styles.uiChip}>800 kWh</span>
                  <span className={styles.uiChip}>1,200 kWh</span>
                </div>
                <p className={styles.uiHint}>
                  Found on your electric bill under “Total kWh used”. Determines how many roof slots need active modules.
                </p>
              </div>
            )}

            {stage === 1 && (
              <div className={styles.fragPane}>
                <p className={styles.uiTitle}>Step 2 · OpenStreetMap footprint &amp; polygon tool</p>
                <div className={styles.fragFootprintBox}>
                  <svg viewBox="0 0 280 150" className={styles.fragSvg} aria-label="Roof footprint polygon with 0.5m inset">
                    <polygon
                      points="28,26 246,18 256,122 38,130"
                      fill="rgba(13, 116, 128, 0.16)"
                      stroke="#0d7480"
                      strokeWidth="2.5"
                    />
                    <polygon
                      points="40,38 234,31 242,110 50,117"
                      fill="none"
                      stroke="#1f3038"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <circle cx="28" cy="26" r="4.5" fill="#0d7480" />
                    <circle cx="246" cy="18" r="4.5" fill="#0d7480" />
                    <circle cx="256" cy="122" r="4.5" fill="#0d7480" />
                    <circle cx="38" cy="130" r="4.5" fill="#0d7480" />
                  </svg>
                </div>
                <div className={styles.answerRow}>
                  <span>Detected footprint</span>
                  <strong>112 m² · Azimuth 176° S</strong>
                </div>
                <div className={styles.answerRow}>
                  <span>Usable inside 0.5 m setback</span>
                  <strong>84 m² · 28 panel slots</strong>
                </div>
              </div>
            )}

            {stage === 2 && (
              <div className={styles.fragPane}>
                <p className={styles.uiTitle}>Step 3 · 550 W panel packing (7 of 28 slots active)</p>
                <div className={styles.fragMiniGrid}>
                  {Array.from({ length: 28 }, (_, i) => {
                    const active = i >= 6 && i <= 12;
                    return (
                      <span
                        key={i}
                        className={active ? `${styles.roofSlot} ${styles.roofSlotOn}` : styles.roofSlot}
                      />
                    );
                  })}
                </div>
                <div className={styles.answerRow}>
                  <span>Active array</span>
                  <strong>7 panels · 3.85 kWp</strong>
                </div>
                <div className={styles.answerRow}>
                  <span>Full roof potential</span>
                  <strong>28 panels · 15.40 kWp</strong>
                </div>
              </div>
            )}

            {stage === 3 && (
              <div className={styles.fragPane}>
                <p className={styles.uiTitle}>Step 4 · NREL PVWatts v8 monthly production (3.85 kWp)</p>
                <ul className={styles.fragBars} aria-label="Monthly production in kWh">
                  {MANILA_KWH_PER_KWP.map((perKw, i) => {
                    const val = Math.round(perKw * 3.85);
                    const pct = Math.round((val / 600) * 100);
                    return (
                      <li key={MONTHS[i]} className={styles.fragBarRow}>
                        <span className={styles.fragMonth}>{MONTHS[i]}</span>
                        <span className={styles.fragTrack}>
                          <span className={styles.fragFill} style={{ width: `${pct}%` }} />
                        </span>
                        <span className={styles.fragVal}>{val}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.sliderDock} data-ui>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={stage}
          onChange={(e) => setStage(Number(e.target.value))}
          className={styles.stageRange}
          aria-label="Step of the solar planning workflow"
        />
        <div className={styles.stageTabs}>
          {STAGES.map((s, idx) => (
            <button
              key={s.name}
              type="button"
              className={idx === stage ? `${styles.stageTab} ${styles.stageTabActive}` : styles.stageTab}
              onClick={() => setStage(idx)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RoofAreaCalculator() {
  const [area, setArea] = useState(110);
  // Usable area after 0.5m setback and roof obstructions (~72% packing factor), 2.58 m² per 550 W panel
  const usableM2 = Math.round(area * 0.72);
  const maxPanels = Math.max(2, Math.floor(usableM2 / PANEL_AREA_M2));
  const systemKw = maxPanels * PANEL_KW;
  const annualKwh = Math.round(systemKw * ANNUAL_PER_KWP);

  return (
    <div className={styles.statsControlWrap}>
      <div className={styles.statsSliderBox} data-ui>
        <div className={styles.statsSliderHeader}>
          <label htmlFor="roof-area-slider" className={styles.uiLabel}>
            Roof footprint area
          </label>
          <strong className={styles.statsAreaReadout}>
            {area} m² ({maxPanels} panels · {systemKw.toFixed(1)} kWp)
          </strong>
        </div>
        <input
          id="roof-area-slider"
          type="range"
          min={40}
          max={240}
          step={5}
          value={area}
          onChange={(e) => setArea(Number(e.target.value))}
          className={styles.stageRange}
        />
        <div className={styles.statsRangeLabels}>
          <span>40 m² townhouse</span>
          <span>110 m² bungalow</span>
          <span>240 m² residence</span>
        </div>
      </div>

      <div className={styles.giantFigureBlock}>
        <p className={styles.giantNumeral}>
          {annualKwh.toLocaleString()}
          <span className={styles.giantUnit}> kWh / yr</span>
        </p>
        <p className={styles.giantFormula}>
          Calculated from {usableM2} m² usable area after a 0.5 m setback ({maxPanels} × 550 W modules at 1,500 kWh per
          kWp annually in Metro Manila).
        </p>
      </div>
    </div>
  );
}
