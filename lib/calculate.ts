import "server-only";
import { z } from "zod";
import { isWithinMapBounds } from "@/lib/config";
import { approxAreaM2, ringCentroid, utmSrid, type PolygonGeometry } from "@/lib/geo";
import { fitPanels } from "@/lib/panel-fit";
import { fetchPvwatts, PvwattsError } from "@/lib/pvwatts";
import { sizeSystem } from "@/lib/sizing";
import type { CalculateSolarResponse } from "@/lib/types";

export const ROOF_TILT_DEG = 15;
const MAX_ROOF_AREA_M2 = 5_000;
const MAX_VERTICES = 500;

const position = z.union([
  z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number()]),
]);

export const roofInputSchema = z.object({
  geometry: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(position).min(4)).min(1),
  }),
  monthlyKwh: z.number().positive().max(100_000),
  osmId: z.string().max(64).optional(),
});

export type RoofInput = z.infer<typeof roofInputSchema>;

/** A failure the caller should report to the client with this HTTP status. */
export class CalculationError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Calculation {
  result: CalculateSolarResponse;
  geometry: PolygonGeometry;
  /** The recommended panels, as installed. */
  chosenPanels: PolygonGeometry[];
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Fits panels on the roof (PostGIS) and estimates production (PVWatts) for the target usage. */
export async function calculateSolar(input: RoofInput): Promise<Calculation> {
  const { monthlyKwh: target } = input;
  const geometry = input.geometry as PolygonGeometry;

  const vertexCount = geometry.coordinates.reduce((n, ring) => n + ring.length, 0);
  if (vertexCount > MAX_VERTICES) throw new CalculationError(400, `Footprint has too many vertices (max ${MAX_VERTICES})`);

  const area = approxAreaM2(geometry);
  if (area > MAX_ROOF_AREA_M2) {
    throw new CalculationError(
      400,
      `Footprint is ${Math.round(area)} m², larger than the ${MAX_ROOF_AREA_M2} m² limit for residential roofs`,
    );
  }

  const { lon, lat } = ringCentroid(geometry.coordinates[0]);
  if (!isWithinMapBounds(lon, lat)) throw new CalculationError(400, "Only buildings in the Philippines are supported");
  const srid = utmSrid(lon, lat);
  // Panels face the equator.
  const azimuthDeg = lat >= 0 ? 180 : 0;

  let fit;
  try {
    fit = await fitPanels(geometry, srid);
  } catch (err) {
    console.error("[calculate] PostGIS fitting failed", err);
    throw new CalculationError(422, "Could not process this building footprint");
  }
  if (!fit) throw new CalculationError(422, "Building footprint is empty or degenerate");

  const maxPanels = fit.panels.length;
  const base = {
    roofAreaM2: round(fit.roofAreaM2),
    roofBearingDeg: round(fit.roofBearingDeg),
    layout: fit.layout,
    maxPanels,
    targetMonthlyKwh: target,
    tiltDeg: ROOF_TILT_DEG,
    azimuthDeg,
  };

  if (maxPanels === 0) {
    return {
      geometry,
      chosenPanels: [],
      result: {
        ...base,
        maxSystemKw: 0,
        maxMonthlyKwh: 0,
        recommendedPanels: 0,
        systemCapacityKw: 0,
        estMonthlyKwh: 0,
        annualKwh: 0,
        monthlyKwh: Array(12).fill(0),
        monthlyKwhPerKw: [],
        coveragePct: 0,
        weatherStation: null,
        panels: { type: "FeatureCollection", features: [] },
        message: "No full-size panel fits on this roof after the edge setback.",
      },
    };
  }

  // PVWatts output is linear in system size, so one 1 kWp run gives a per-kWp yield we can scale.
  let yieldPerKw;
  try {
    yieldPerKw = await fetchPvwatts({ systemCapacityKw: 1, lat, lon, tiltDeg: ROOF_TILT_DEG, azimuthDeg });
  } catch (err) {
    console.error("[calculate]", err);
    throw new CalculationError(502, err instanceof PvwattsError ? err.message : "PVWatts request failed");
  }

  const s = sizeSystem(target, maxPanels, yieldPerKw.acMonthlyKwh);
  const { neededPanels, recommendedPanels } = s;

  return {
    geometry,
    // Panels come back sorted centre-out, so the first N form a compact block.
    chosenPanels: fit.panels.slice(0, recommendedPanels),
    result: {
      ...base,
      maxSystemKw: round(s.maxSystemKw, 2),
      maxMonthlyKwh: round(s.maxMonthlyKwh),
      recommendedPanels,
      systemCapacityKw: round(s.systemCapacityKw, 2),
      estMonthlyKwh: round(s.estMonthlyKwh),
      annualKwh: round(s.annualKwh),
      monthlyKwh: s.monthlyKwh.map((v) => round(v)),
      monthlyKwhPerKw: yieldPerKw.acMonthlyKwh.map((v) => round(v, 3)),
      coveragePct: round(s.coveragePct),
      weatherStation: yieldPerKw.stationLocation,
      panels: {
        type: "FeatureCollection",
        features: fit.panels.map((g, index) => ({
          type: "Feature",
          properties: { index, recommended: index < recommendedPanels },
          geometry: g,
        })),
      },
      ...(neededPanels > maxPanels && {
        message: `The roof fits ${maxPanels} panels; about ${neededPanels} would be needed to meet the target.`,
      }),
    },
  };
}
