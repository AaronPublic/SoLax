import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import DeletePlanButton from "@/components/DeletePlanButton";
import { db } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Saved roof plans · Solar Roof Planner" };

export default function PlansPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>Saved roof plans</h1>
            <p className={styles.subtitle}>
              Compare 550 W monocrystalline arrays across different roofs or monthly electric bill targets.
            </p>
          </div>
          <Link href="/plan" className={styles.newPlan}>
            New roof plan
          </Link>
        </div>
        <Suspense fallback={<p className={styles.muted}>Loading your saved plans…</p>}>
          <PlanList />
        </Suspense>
      </main>
    </>
  );
}

async function PlanList() {
  const user = await getUser();
  if (!user) redirect("/login?next=/plans");

  const plans = await db().solarPlan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      targetMonthlyKwh: true,
      recommendedPanels: true,
      maxPanels: true,
      systemCapacityKw: true,
      estMonthlyKwh: true,
      coveragePct: true,
      roofAreaM2: true,
    },
  });

  if (plans.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>No saved roof plans yet</h2>
        <p>Select your roof on the Philippine satellite map, enter your monthly kWh bill, and press “Save this plan”.</p>
        <Link href="/plan" className={styles.newPlan}>
          Open roof planner
        </Link>
      </div>
    );
  }

  const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });
  const totalKw = plans.reduce((acc, p) => acc + p.systemCapacityKw, 0);
  const totalMonthlyKwh = plans.reduce((acc, p) => acc + Math.round(p.estMonthlyKwh), 0);
  const avgCoverage = Math.round(plans.reduce((acc, p) => acc + p.coveragePct, 0) / plans.length);

  return (
    <div className={styles.ledger}>
      <dl className={styles.kpiStrip}>
        <div className={styles.kpiCell}>
          <dt>Saved roofs</dt>
          <dd>{plans.length}</dd>
        </div>
        <div className={styles.kpiCell}>
          <dt>Combined array size</dt>
          <dd>
            {totalKw.toFixed(2)} <span>kWp</span>
          </dd>
        </div>
        <div className={styles.kpiCell}>
          <dt>Combined monthly yield</dt>
          <dd>
            {totalMonthlyKwh.toLocaleString()} <span>kWh / mo</span>
          </dd>
        </div>
        <div className={styles.kpiCell}>
          <dt>Average bill offset</dt>
          <dd className={avgCoverage >= 100 ? styles.ok : styles.warn}>{avgCoverage}%</dd>
        </div>
      </dl>

      <ul className={styles.grid}>
        {plans.map((p) => {
          const coverage = Math.round(p.coveragePct);
          return (
            <li key={p.id} className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>{p.name}</h2>
                <span className={styles.date}>{dateFmt.format(p.createdAt)}</span>
              </div>
              <dl className={styles.stats}>
                <div>
                  <dt>Panels</dt>
                  <dd>
                    {p.recommendedPanels} <span>of {p.maxPanels}</span>
                  </dd>
                </div>
                <div>
                  <dt>System</dt>
                  <dd>
                    {p.systemCapacityKw.toFixed(2)} <span>kWp</span>
                  </dd>
                </div>
                <div>
                  <dt>Per month</dt>
                  <dd>
                    {Math.round(p.estMonthlyKwh).toLocaleString()} <span>kWh</span>
                  </dd>
                </div>
                <div>
                  <dt>Covers</dt>
                  <dd className={coverage >= 100 ? styles.ok : styles.warn}>{coverage}%</dd>
                </div>
              </dl>
              <p className={styles.meta}>
                Target {Math.round(p.targetMonthlyKwh).toLocaleString()} kWh/month · {Math.round(p.roofAreaM2)} m² roof
                footprint
              </p>
              <div className={styles.actions}>
                <Link href={`/plan?plan=${p.id}`} className={styles.open}>
                  Open on map
                </Link>
                <DeletePlanButton id={p.id} name={p.name} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
