import { Suspense } from "react";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import Logo from "@/components/Logo";
import styles from "./AuthPage.module.css";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  return (
    <div className={styles.page}>
      <aside className={styles.leftPane}>
        <header className={styles.header}>
          <Logo />
        </header>
        <div className={styles.brief}>
          <p className={styles.statement}>
            Keep your 550 W roof layouts and monthly NREL PVWatts production plans in one account.
          </p>
          <dl className={styles.specList}>
            <div>
              <dt>Roof geometry</dt>
              <dd>OpenStreetMap building footprints &amp; custom polygon tracing</dd>
            </div>
            <div>
              <dt>Weather dataset</dt>
              <dd>NREL PVWatts v8 · Philippine 12-month irradiance</dd>
            </div>
            <div>
              <dt>Instant comparison</dt>
              <dd>Reopen any saved roof on the satellite map and adjust kWh usage</dd>
            </div>
          </dl>
        </div>
        <footer className={styles.leftFooter}>
          <Link href="/plan" className={styles.backLink}>
            ← Back to satellite planner
          </Link>
        </footer>
      </aside>

      <main className={styles.main}>
        <Suspense fallback={null}>
          <AuthForm mode={mode} />
        </Suspense>
      </main>
    </div>
  );
}
