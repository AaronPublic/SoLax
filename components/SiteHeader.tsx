import { Suspense } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { getUser } from "@/lib/supabase/server";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Logo />
        <nav className={styles.nav} aria-label="Main">
          <Link href="/plan" className={styles.link}>
            Planner
          </Link>
          <Suspense fallback={<span className={styles.placeholder} />}>
            <AccountLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function AccountLinks() {
  const user = await getUser();

  if (!user) {
    return (
      <>
        <Link href="/login" className={styles.link}>
          Log in
        </Link>
        <Link href="/register" className={styles.primary}>
          Create account
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/plans" className={styles.link}>
        My plans
      </Link>
      <span className={styles.email} title={user.email ?? undefined}>
        {user.email}
      </span>
      <form action="/auth/signout" method="post" className={styles.signoutForm}>
        <button type="submit" className={styles.secondary}>
          Sign out
        </button>
      </form>
    </>
  );
}
