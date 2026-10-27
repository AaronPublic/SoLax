import { z } from "zod";
import { db } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import { calculateSolar, CalculationError, roofInputSchema } from "@/lib/calculate";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const MAX_PLANS_PER_USER = 100;

const saveSchema = roofInputSchema.extend({
  name: z.string().trim().min(1).max(80),
});

function error(status: number, message: string, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}

/** Save a plan. The server recomputes it from the roof and target rather than trusting client numbers. */
export async function POST(request: Request) {
  const limited = rateLimit(request, "savePlan");
  if (limited) return limited;

  const user = await getUser();
  if (!user) return error(401, "Log in to save plans");

  const parsed = saveSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return error(400, "Invalid request body", z.flattenError(parsed.error).fieldErrors);

  const count = await db().solarPlan.count({ where: { userId: user.id } });
  if (count >= MAX_PLANS_PER_USER) return error(400, `You can keep up to ${MAX_PLANS_PER_USER} plans. Delete one first.`);

  let calc;
  try {
    calc = await calculateSolar(parsed.data);
  } catch (err) {
    if (err instanceof CalculationError) return error(err.status, err.message);
    throw err;
  }
  const { result, geometry } = calc;
  if (result.maxPanels === 0) return error(422, "No panel fits on this roof, so there's nothing to save.");

  const rows = await db().$queryRaw<{ id: string }[]>`
    INSERT INTO "SolarPlan" (
      "userId", "name", "osmId", "targetMonthlyKwh", "recommendedPanels", "maxPanels",
      "systemCapacityKw", "estMonthlyKwh", "coveragePct", "roofAreaM2", "result", "footprint"
    ) VALUES (
      ${user.id}::uuid, ${parsed.data.name}, ${parsed.data.osmId ?? null}, ${result.targetMonthlyKwh},
      ${result.recommendedPanels}, ${result.maxPanels}, ${result.systemCapacityKw}, ${result.estMonthlyKwh},
      ${result.coveragePct}, ${result.roofAreaM2}, ${JSON.stringify(result)}::jsonb,
      ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text)), 4326)
    )
    RETURNING "id"::text AS id`;

  return Response.json({ id: rows[0].id }, { status: 201 });
}
