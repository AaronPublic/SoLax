import { z } from "zod";
import { db } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import type { PolygonGeometry } from "@/lib/geo";
import type { CalculateSolarResponse, SavedPlanResponse } from "@/lib/types";

const idSchema = z.uuid();

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/** A saved plan with its roof outline, for reopening it on the map. Owner only. */
export async function GET(_request: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const user = await getUser();
  if (!user) return error(401, "Log in to open saved plans");

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return error(404, "Plan not found");

  const rows = await db().$queryRaw<
    { id: string; name: string; osmId: string | null; targetMonthlyKwh: number; result: CalculateSolarResponse; footprint: PolygonGeometry }[]
  >`
    SELECT "id"::text AS id, "name", "osmId", "targetMonthlyKwh", "result",
           ST_AsGeoJSON("footprint", 8)::json AS footprint
    FROM "SolarPlan"
    WHERE "id" = ${id}::uuid AND "userId" = ${user.id}::uuid`;

  const plan = rows[0];
  if (!plan) return error(404, "Plan not found");

  const body: SavedPlanResponse = plan;
  return Response.json(body);
}

/** Delete a saved plan. Owner only. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const user = await getUser();
  if (!user) return error(401, "Log in to manage plans");

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return error(404, "Plan not found");

  const { count } = await db().solarPlan.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return error(404, "Plan not found");
  return new Response(null, { status: 204 });
}
