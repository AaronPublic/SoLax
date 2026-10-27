import "server-only";
import type { Position } from "@/lib/geo";
import type { Bbox } from "@/lib/tiles";
import type { BuildingFeature } from "@/lib/types";

// Public Overpass instances are free community services that are often at capacity, so we try
// several in turn. OVERPASS_URLS (comma-separated) overrides the list.
const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Overpass asks clients to identify themselves; generic user agents get 406.
const USER_AGENT = "SolarRoofPlanner/0.1 (rooftop solar estimator; Next.js server)";
const PER_ENDPOINT_TIMEOUT_MS = 20_000;

export class OverpassUnavailableError extends Error {}

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

function endpoints(): string[] {
  const custom = process.env.OVERPASS_URLS?.split(",").map((s) => s.trim()).filter(Boolean);
  return custom?.length ? custom : DEFAULT_ENDPOINTS;
}

/**
 * Fetches building outlines (closed OSM ways tagged building=*) inside the bbox, trying each
 * Overpass endpoint until one answers. Multipolygon relations are skipped: they are rare for
 * houses and the solar API expects a single Polygon.
 */
export async function fetchBuildings(bbox: Bbox, deadline: number): Promise<BuildingFeature[]> {
  const b = [bbox.south, bbox.west, bbox.north, bbox.east].map((n) => n.toFixed(6)).join(",");
  const query = `[out:json][timeout:25];way["building"](${b});out geom;`;
  const failures: string[] = [];

  for (const url of endpoints()) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(Math.min(PER_ENDPOINT_TIMEOUT_MS, remaining)),
        cache: "no-store",
      });
      if (!res.ok) {
        failures.push(`${new URL(url).host}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { elements?: OverpassWay[]; remark?: string };
      // Overpass reports query timeouts / memory exhaustion as a 200 with a "remark".
      if (!data.elements || (data.remark && /error|timed out|out of memory/i.test(data.remark))) {
        failures.push(`${new URL(url).host}: ${data.remark ?? "no elements"}`);
        continue;
      }
      return toFeatures(data.elements);
    } catch (err) {
      failures.push(`${new URL(url).host}: ${err instanceof Error ? err.name : "error"}`);
    }
  }

  throw new OverpassUnavailableError(`All Overpass servers failed (${failures.join("; ")})`);
}

function toFeatures(elements: OverpassWay[]): BuildingFeature[] {
  const features: BuildingFeature[] = [];
  for (const el of elements) {
    const pts = el.geometry;
    if (el.type !== "way" || !pts || pts.length < 4) continue;
    const ring: Position[] = pts.map((p) => [p.lon, p.lat]);
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) continue; // not closed

    const id = `way/${el.id}`;
    features.push({
      type: "Feature",
      id,
      properties: { id, building: el.tags?.building ?? "yes", ...(el.tags?.name && { name: el.tags.name }) },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }
  return features;
}
