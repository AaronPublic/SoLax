import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import styles from "./page.module.css";

// Example roof for the hero illustration: 7 x 6 slots, the 12 nearest the centre in use.
const COLS = 7;
const ROWS = 6;
const SHOWN = 12;
const slots = Array.from({ length: COLS * ROWS }, (_, i) => {
  const dx = ((i % COLS) - (COLS - 1) / 2) * 36;
  const dy = (Math.floor(i / COLS) - (ROWS - 1) / 2) * 19;
  return { i, d: dx * dx + dy * dy };
});
const inUse = new Set([...slots].sort((a, b) => a.d - b.d).slice(0, SHOWN).map((s) => s.i));

const STEPS = [
  { title: "Enter your monthly usage", body: "Use the total kWh from your electric bill. Not sure? Pick a typical household amount." },
  { title: "Click your roof", body: "Roofs light up as you hover over the satellite map. Click yours to select it." },
  { title: "Get your plan", body: "See the panel layout, the system size you need and what it should produce every month." },
];

const FEATURES = [
  {
    title: "Your real roof outline",
    body: "Building outlines from OpenStreetMap. Panels are fitted to the shape and direction of your roof, with a 0.5 m clear edge.",
    icon: <path d="M3 11l9-7 9 7M5 10v10h14V10" />,
  },
  {
    title: "Local sun data",
    body: "Production estimates from NREL PVWatts v8, using satellite weather data for your location in the Philippines.",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    title: "Sized to your bill",
    body: "Recommends just enough panels to cover your usage, and shows what your whole roof could produce.",
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    title: "Saved to your account",
    body: "Keep plans for different roofs or usage levels, and reopen any of them on the map later.",
    icon: <path d="M6 3h12v18l-6-4-6 4z" />,
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Free rooftop solar estimate · Philippines</p>
            <h1 className={styles.headline}>See how many solar panels fit on your roof.</h1>
            <p className={styles.lead}>
              Find your house on a satellite map and click its roof. We lay out 550 W panels on its real outline, then
              show the system size you need for your electric bill and how much it should produce each month.
            </p>
            <div className={styles.ctas}>
              <Link href="/plan" className={styles.ctaPrimary}>
                Start planning
              </Link>
              <Link href="/register" className={styles.ctaSecondary}>
                Create a free account
              </Link>
            </div>
            <p className={styles.note}>No sign-up needed to try. Create an account to save your plans.</p>
          </div>

          <figure className={styles.visual} aria-label="Example: 12 panels laid out on a roof in Metro Manila">
            <div className={styles.street} aria-hidden="true" />
            <div className={styles.house1} aria-hidden="true" />
            <div className={styles.house2} aria-hidden="true" />
            <div className={styles.house3} aria-hidden="true" />
            <div className={styles.roof} aria-hidden="true">
              <div className={styles.grid}>
                {slots.map((s) => (
                  <span key={s.i} className={inUse.has(s.i) ? styles.panel : styles.slot} />
                ))}
              </div>
            </div>
            <div className={styles.chipTop}>
              <strong>12 panels</strong> · 6.6 kWp
            </div>
            <div className={styles.chipBottom}>
              ≈ <strong>703 kWh</strong> per month
            </div>
            <figcaption className={styles.caption}>Example roof in Metro Manila</figcaption>
          </figure>
        </section>

        <section className={styles.section} aria-labelledby="how">
          <h2 id="how" className={styles.sectionTitle}>
            How it works
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.title} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.sectionAlt} aria-labelledby="why">
          <div className={styles.sectionInner}>
            <h2 id="why" className={styles.sectionTitle}>
              Built on real data
            </h2>
            <ul className={styles.features}>
              {FEATURES.map((f) => (
                <li key={f.title} className={styles.feature}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {f.icon}
                  </svg>
                  <h3 className={styles.featureTitle}>{f.title}</h3>
                  <p className={styles.featureBody}>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>Ready to look at your roof?</h2>
          <Link href="/plan" className={styles.ctaPrimaryInverse}>
            Start planning
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Estimates only, not a quote: roof shading and pitch are not modelled. Building outlines ©{" "}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. Solar data: NREL PVWatts.
        </p>
      </footer>
    </>
  );
}
