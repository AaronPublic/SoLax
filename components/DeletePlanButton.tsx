"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./DeletePlanButton.module.css";

export default function DeletePlanButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete “${name}”? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      setBusy(false);
      window.alert("Couldn't delete the plan. Please try again.");
      return;
    }
    router.refresh();
  }

  return (
    <button type="button" className={styles.button} onClick={onDelete} disabled={busy} aria-label={`Delete ${name}`}>
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
