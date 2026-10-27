// System sizing shared by the API route and the browser, so the sidebar can re-size instantly
// when the user edits their monthly consumption without another round trip.

/** 550 W module, nominal 2 m x 1 m. */
export const PANEL = { lengthM: 2, widthM: 1, watts: 550 } as const;
export const PANEL_KW = PANEL.watts / 1000;

export interface Sizing {
  /** Panels needed to cover the target; may exceed what fits. */
  neededPanels: number;
  /** Panels to install: needed, capped at what fits. Always ≥1 when anything fits. */
  recommendedPanels: number;
  systemCapacityKw: number;
  monthlyKwh: number[];
  annualKwh: number;
  estMonthlyKwh: number;
  coveragePct: number;
  maxSystemKw: number;
  maxMonthlyKwh: number;
}

/**
 * PVWatts output is linear in system size, so a 1 kWp monthly profile scales to any system.
 * `monthlyPerKw` is empty when nothing fits on the roof (PVWatts isn't called then).
 */
export function sizeSystem(targetMonthlyKwh: number, maxPanels: number, monthlyPerKw: number[]): Sizing {
  const annualPerKw = monthlyPerKw.reduce((a, b) => a + b, 0);
  const avgPerKw = annualPerKw / 12;

  const neededPanels = targetMonthlyKwh > 0 && avgPerKw > 0 ? Math.ceil(targetMonthlyKwh / avgPerKw / PANEL_KW) : 0;
  const recommendedPanels = maxPanels > 0 ? Math.max(1, Math.min(maxPanels, neededPanels)) : 0;
  const systemCapacityKw = recommendedPanels * PANEL_KW;
  const annualKwh = annualPerKw * systemCapacityKw;
  const estMonthlyKwh = annualKwh / 12;

  return {
    neededPanels,
    recommendedPanels,
    systemCapacityKw,
    monthlyKwh: monthlyPerKw.map((v) => v * systemCapacityKw),
    annualKwh,
    estMonthlyKwh,
    coveragePct: targetMonthlyKwh > 0 ? (estMonthlyKwh / targetMonthlyKwh) * 100 : 0,
    maxSystemKw: maxPanels * PANEL_KW,
    maxMonthlyKwh: avgPerKw * maxPanels * PANEL_KW,
  };
}
