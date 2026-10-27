import { db } from "@/lib/prisma";
import { MAP_BOUNDS } from "@/lib/config";
import { ringCentroid } from "@/lib/geo";
import { fetchBuildingsFromTiles } from "@/lib/openfreemap";
import { rateLimit } from "@/lib/rate-limit";
import { fetchBuildings, OverpassUnavailableError } from "@/lib/overpass";
import { isTileKey, MAX_TILES_PER_REQUEST, tileBbox, tileOf, unionBbox, type Bbox } from "@/lib/tiles";
import type { BuildingFeature, BuildingsResponse } from "@/lib/types";

export const maxDuration = 60;

/** OSM changes slowly; refetch a tile after this long. */
const TILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Leave headroom under maxDuration for the database round trips. */
const FETCH_BUDGET_MS = 45_000;
const TILES_BUDGET_MS = 15_000;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * GET /api/buildings?tiles=<ix>_<iy>,...
 *
 * Building outlines for the requested tiles: from the BuildingTile cache when fresh, otherwise from
 * OpenFreeMap vector tiles (falling back to the Overpass API), then cached.
 * Tiles that can't be fetched come back in `missingTiles` so the client can retry them later.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, "buildings");
  if (limited) return limited;

  const raw = new URL(request.url).searchParams.get("tiles") ?? "";
  const keys = [...new Set(raw.split(",").filter(Boolean))];
  if (keys.length === 0 || keys.length > MAX_TILES_PER_REQUEST || !keys.every(isTileKey)) {
    return error(400, `Pass 1-${MAX_TILES_PER_REQUEST} tile keys as ?tiles=<ix>_<iy>,...`);
  }
  if (!keys.every((k) => intersectsMapBounds(k))) return error(400, "Only areas in the Philippines are supported");

  const features: BuildingFeature[] = [];
  const have = new Set<string>();

  try {
    const cached = await db().buildingTile.findMany({
      where: { key: { in: keys }, fetchedAt: { gte: new Date(Date.now() - TILE_TTL_MS) } },
    });
    for (const tile of cached) {
      features.push(...(tile.features as unknown as BuildingFeature[]));
      have.add(tile.key);
    }
  } catch (err) {
    // A cache outage shouldn't stop the map; fall through to Overpass.
    console.error("[buildings] cache read failed", err);
  }

  let missing = keys.filter((k) => !have.has(k));

  if (missing.length > 0) {
    try {
      const fresh = await fetchOutlines(unionBbox(missing));

      // The union bbox can overlap tiles we already have; keep each building in its centroid's tile.
      const buckets = new Map<string, BuildingFeature[]>(missing.map((k) => [k, []]));
      for (const f of fresh) {
        const { lon, lat } = ringCentroid(f.geometry.coordinates[0]);
        buckets.get(tileOf(lon, lat))?.push(f);
      }
      for (const list of buckets.values()) features.push(...list);
      missing = [];

      try {
        // One statement for all tiles: the database is far away, so per-row round trips inside a
        // transaction can outlive Prisma's 5 s transaction timeout.
        const rows = [...buckets].map(([key, list]) => ({ key, count: list.length, features: list }));
        await db().$executeRaw`
          INSERT INTO "BuildingTile" ("key", "count", "features", "fetchedAt")
          SELECT t."key", t."count", t."features", now()
          FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS t("key" text, "count" int, "features" jsonb)
          ON CONFLICT ("key") DO UPDATE
            SET "count" = EXCLUDED."count", "features" = EXCLUDED."features", "fetchedAt" = EXCLUDED."fetchedAt"`;
      } catch (err) {
        console.error("[buildings] cache write failed", err);
      }
    } catch (err) {
      if (!(err instanceof OverpassUnavailableError)) throw err;
      console.warn("[buildings]", err.message);
    }
  }

  const body: BuildingsResponse = {
    type: "FeatureCollection",
    features,
    loadedTiles: keys.filter((k) => !missing.includes(k)),
    missingTiles: missing,
  };
  return Response.json(body);
}

/** OpenFreeMap first (fast CDN); the Overpass API only when the tiles can't be read. */
async function fetchOutlines(bbox: Bbox): Promise<BuildingFeature[]> {
  const start = Date.now();
  try {
    return await fetchBuildingsFromTiles(bbox, start + TILES_BUDGET_MS);
  } catch (err) {
    console.warn("[buildings] OpenFreeMap failed, trying Overpass:", err instanceof Error ? err.message : err);
    return fetchBuildings(bbox, start + FETCH_BUDGET_MS);
  }
}

function intersectsMapBounds(key: string) {
  const t = tileBbox(key);
  return t.north >= MAP_BOUNDS.south && t.south <= MAP_BOUNDS.north && t.east >= MAP_BOUNDS.west && t.west <= MAP_BOUNDS.east;
}
