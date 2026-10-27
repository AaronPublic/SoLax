import Link from "next/link";
import styles from "./Logo.module.css";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={styles.logo}>
      <span className={styles.mark}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sun)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
      Solar Roof Planner
    </Link>
  );
}
