import type { Metadata } from "next";
import { Suspense } from "react";
import SolarPlanner from "@/components/SolarPlanner";

export const metadata: Metadata = { title: "Planner · Solar Roof Planner" };

export default function PlanPage() {
  // The planner reads ?plan= and ?resume= from the URL, which is request-time data.
  return (
    <Suspense fallback={null}>
      <SolarPlanner />
    </Suspense>
  );
}
