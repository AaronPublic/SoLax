import { z } from "zod";
import { db } from "@/lib/prisma";
import { calculateSolar, CalculationError, roofInputSchema, ROOF_TILT_DEG } from "@/lib/calculate";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

function error(status: number, message: string, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "calculate");
  if (limited) return limited;

  const json = await request.json().catch(() => undefined);
  const parsed = roofInputSchema.safeParse(json);
  if (!parsed.success) return error(400, "Invalid request body", z.flattenError(parsed.error).fieldErrors);

  let calc;
  try {
    calc = await calculateSolar(parsed.data);
  } catch (err) {
    if (err instanceof CalculationError) return error(err.status, err.message);
    throw err;
  }
  const { result, geometry, chosenPanels } = calc;

  if (result.maxPanels === 0) return Response.json(result);

  // Logging is best-effort: a database hiccup shouldn't cost the user their result.
  try {
    const footprint = JSON.stringify(geometry);
    const panels = JSON.stringify({ type: "MultiPolygon", coordinates: chosenPanels.map((g) => g.coordinates) });
    await db().$executeRaw`
      INSERT INTO "SolarCalculation" (
        "osmId", "targetMonthlyKwh", "roofAreaM2", "maxPanels", "recommendedPanels",
        "systemCapacityKw", "estMonthlyKwh", "monthlyKwh", "tiltDeg", "azimuthDeg", "footprint", "panels"
      ) VALUES (
        ${parsed.data.osmId ?? null}, ${result.targetMonthlyKwh}, ${result.roofAreaM2}, ${result.maxPanels},
        ${result.recommendedPanels}, ${result.systemCapacityKw}, ${result.estMonthlyKwh},
        ${JSON.stringify(result.monthlyKwh)}::jsonb, ${ROOF_TILT_DEG}, ${result.azimuthDeg},
        ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(${footprint}::text)), 4326),
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${panels}::text), 4326))
      )`;
  } catch (err) {
    console.error("[calculate-solar] failed to log calculation", err);
  }

  return Response.json(result);
}
