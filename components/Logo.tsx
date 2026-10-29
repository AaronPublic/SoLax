import Link from "next/link";
import styles from "./Logo.module.css";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={styles.logo}>
      <svg
        className={styles.mark}
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2 15L12 7L22 15"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="square"
        />
        <rect x="6" y="15" width="5" height="4" fill="currentColor" />
        <rect x="13" y="15" width="5" height="4" fill="currentColor" />
        <circle cx="12" cy="3.5" r="1.75" fill="currentColor" />
      </svg>
      <span className={styles.wordmark}>Solar Roof</span>
    </Link>
  );
}
