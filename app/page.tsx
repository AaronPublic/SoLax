import type { CSSProperties } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import {
  HeroRoofFragment,
  RoofAreaCalculator,
  ScrollRevealInit,
  ShowcaseBillSizer,
  StagesExplorer,
} from "@/components/HomeInteractive";
import styles from "./page.module.css";

const MODEL_SPECS = [
  { param: "Module specification", value: "550 Wp monocrystalline" },
  { param: "Panel dimensions", value: "2.28 m × 1.13 m (2.58 m²)" },
  { param: "Perimeter roof setback", value: "0.50 m all edges" },
  { param: "Array tilt & orientation", value: "15° tilt · 180° South" },
  { param: "System derate & losses", value: "14.0% (heat, inverter, dust)" },
  { param: "Solar irradiance dataset", value: "NREL PVWatts v8 (NSRDB)" },
];

export default function Home() {
  return (
    <>
      <ScrollRevealInit />
      <SiteHeader />
      <main className={styles.page}>
        {/* Hero — Control that reads the page (50/50 tone split) */}
        <section className={styles.hero}>
          <div className={styles.heroLeft}>
            <div className={styles.heroMain}>
              <h1 className={styles.headline}>
                <span className={styles.line}>
                  <span data-line style={{ "--i": 0 } as CSSProperties}>
                    SOLAR SIZED
                  </span>
                </span>
                <span className={styles.line}>
                  <span data-line style={{ "--i": 1 } as CSSProperties}>
                    TO YOUR ROOF
                  </span>
                </span>
              </h1>
              <p className={styles.lead} data-load style={{ "--d": "360ms" } as CSSProperties}>
                Click your house on the Philippine satellite map to fit 550&nbsp;W panels inside its real roof outline
                and compare monthly NREL PVWatts output against your electric bill.
              </p>
              <div className={styles.heroActions} data-load style={{ "--d": "450ms" } as CSSProperties}>
                <Link href="/plan" className={styles.primaryButton}>
                  Open roof planner
                </Link>
                <Link href="/register" className={styles.textAction}>
                  Create free account
                </Link>
              </div>
            </div>

            <dl className={styles.heroFacts} data-load style={{ "--d": "520ms" } as CSSProperties}>
              <div>
                <dt>Module footprint</dt>
                <dd>2.28 × 1.13&nbsp;m (550&nbsp;W)</dd>
              </div>
              <div>
                <dt>Edge clearance</dt>
                <dd>0.50&nbsp;m setback</dd>
              </div>
              <div>
                <dt>Manila reference yield</dt>
                <dd>1,500&nbsp;kWh / kWp / yr</dd>
              </div>
            </dl>
          </div>

          <div className={styles.heroRight}>
            <figure className={styles.heroPhotoWrap} data-open>
              <img
                src="/assets/solar-panels-on-metal-roof.jpg"
                width={1920}
                height={1440}
                fetchPriority="high"
                decoding="async"
                alt="Aerial view of a standing-seam metal roof fitted with a contiguous array of monocrystalline solar panels and a clean perimeter setback"
                className={styles.heroPhoto}
              />
            </figure>
            <HeroRoofFragment />
          </div>
        </section>

        {/* Section 1: Showcase — Headline you can type */}
        <section className={styles.sectionShowcase} aria-labelledby="bill-heading">
          <div className={styles.sectionHeader} data-reveal>
            <h2 id="bill-heading" className={styles.sectionHeading}>
              Size your monthly bill
            </h2>
            <p className={styles.sectionLead}>
              Type your monthly electric bill usage or choose a typical Philippine household tier to calculate the
              array before opening the satellite map.
            </p>
          </div>
          <ShowcaseBillSizer />
        </section>

        {/* Section 2: How it works — Drag through the stages */}
        <section className={styles.sectionStages} aria-labelledby="stages-heading">
          <div className={styles.sectionHeader} data-reveal>
            <h2 id="stages-heading" className={styles.sectionHeading}>
              Four steps to your array
            </h2>
            <p className={styles.sectionLead}>
              Scrub through the four stages of the planner to see how building outlines and satellite weather data turn
              into a roof plan.
            </p>
          </div>
          <StagesExplorer />
        </section>

        {/* Section 3: Stats — Figure set by a slider + Physical model table */}
        <section className={styles.sectionStats} aria-labelledby="stats-heading">
          <div className={styles.statsSplit}>
            <div className={styles.statsLeft} data-reveal>
              <h2 id="stats-heading" className={styles.sectionHeading}>
                How large is your roof?
              </h2>
              <p className={styles.sectionLead}>
                Slide to match your roof area and read the annual electricity a full 550&nbsp;W array produces in Metro
                Manila.
              </p>
              <RoofAreaCalculator />
            </div>

            <div className={styles.statsRight} data-reveal>
              <figure className={styles.videoFigure}>
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster="/assets/sunlight-reflects-off-of-solar-panels-in-poster.jpg"
                  width={854}
                  height={480}
                  className={styles.videoLoop}
                  aria-label="Satellite time-lapse showing sunlight reflecting off utility and rooftop solar arrays"
                >
                  <source src="/assets/sunlight-reflects-off-of-solar-panels-in.webm" type="video/webm" />
                </video>
                <figcaption className={styles.photoCaption}>
                  Satellite solar irradiance pass (GOES / NOAA) alongside the physical constants used in every roof
                  calculation.
                </figcaption>
              </figure>

              <table className={styles.specTable} aria-label="Solar calculation parameters">
                <thead>
                  <tr>
                    <th scope="col">Calculation parameter</th>
                    <th scope="col" className={styles.numCol}>
                      Standard value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MODEL_SPECS.map((row) => (
                    <tr key={row.param}>
                      <td>{row.param}</td>
                      <td className={styles.numCol}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 4: CTA — The action tile */}
        <section className={styles.sectionCta} aria-labelledby="cta-heading">
          <div className={styles.ctaBoard}>
            <figure className={styles.ctaFlank} data-reveal>
              <img
                src="/assets/solar-panels-on-church-roof-full.jpg"
                width={1920}
                height={1280}
                loading="lazy"
                decoding="async"
                alt="Rectangular solar array mounted flush on a large pitched roof under a clear sky"
                className={styles.ctaFlankImg}
              />
            </figure>

            <div className={styles.ctaCenter} data-reveal>
              <h2 id="cta-heading" className={styles.ctaHeading}>
                Map your roof now
              </h2>
              <p className={styles.ctaBody}>
                Find your house on the satellite map and click its roof. No account is required to test your address;
                sign in anytime to save and compare plans.
              </p>
              <div className={styles.ctaActions}>
                <Link href="/plan" className={styles.ctaPrimaryButton}>
                  Open roof planner
                </Link>
                <Link href="/plans" className={styles.ctaSecondaryLink}>
                  View saved plans
                </Link>
              </div>
            </div>

            <figure className={styles.ctaFlank} data-reveal>
              <img
                src="/assets/moody-metro-manila.jpg"
                width={1920}
                height={1280}
                loading="lazy"
                decoding="async"
                alt="Aerial view across Metro Manila rooftops and skyline with tropical clouds and sunlight"
                className={styles.ctaFlankImg}
              />
            </figure>
          </div>
        </section>
      </main>

      {/* Footer — A single quiet line + open-collection credits */}
      <footer className={styles.footer}>
        <div className={styles.footerLine}>
          <span className={styles.footerBrand}>Solar Roof Planner · Philippines</span>
          <nav className={styles.footerNav} aria-label="Footer">
            <Link href="/plan">Planner</Link>
            <Link href="/plans">My plans</Link>
            <Link href="/login">Log in</Link>
            <Link href="/register">Create account</Link>
          </nav>
          <span className={styles.footerMeta}>
            Building outlines © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · NREL PVWatts v8
          </span>
        </div>
        <p className={styles.credits}>
          Pictures and footage:{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Solar_panels_on_metal_roof.jpg">
            “Solar panels on metal roof”
          </a>{" "}
          by Wikideas1, <a href="https://creativecommons.org/publicdomain/zero/1.0/deed.en">CC0</a>;{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Solar_panels_on_a_roof.jpg">“Solar panels on a roof”</a> by
          Pujanak, <a href="https://creativecommons.org/publicdomain/mark/1.0/">public domain</a>;{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Solar_Panels_on_Church_Roof_full.jpg">
            “Solar Panels on Church Roof full”
          </a>{" "}
          by Bastique, <a href="https://creativecommons.org/licenses/by/4.0">CC BY 4.0</a>;{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Sunlight_Reflects_off_of_Solar_Panels_in_the_Western_US_(CIRA_2024-06-24_-_nolabels).webm">
            “Sunlight Reflects off of Solar Panels”
          </a>{" "}
          by CSU/CIRA &amp; NOAA, <a href="https://creativecommons.org/publicdomain/mark/1.0/">public domain</a>;{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Moody_Metro_Manila.tif">“Moody Metro Manila”</a> by Frank
          Schuengel, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>, via Wikimedia Commons.
        </p>
      </footer>
    </>
  );
}
