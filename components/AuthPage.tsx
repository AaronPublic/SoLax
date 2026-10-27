import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import Logo from "@/components/Logo";
import styles from "./AuthPage.module.css";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
      </header>
      <main className={styles.main}>
        {/* The form reads ?next= and ?error= from the URL, which is request-time data. */}
        <Suspense fallback={null}>
          <AuthForm mode={mode} />
        </Suspense>
      </main>
    </div>
  );
}
