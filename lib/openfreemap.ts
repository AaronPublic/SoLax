import "server-only";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { ringCentroid, type Position } from "@/lib/geo";
import type { Bbox } from "@/lib/tiles";
import type { BuildingFeature } from "@/lib/types";

// OpenFreeMap serves weekly OpenStreetMap vector tiles (OpenMapTiles schema) from a CDN: free,
// no key, and far more reliable than the public Overpass servers. Its z14 tiles carry every
// building outline, quantised to 1/4096 of a tile (~0.6 m in the Philippines).
const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const ZOOM = 14;
/** The tile URL contains the weekly build id, so re-read it from the TileJSON now and then. */
const TILEJSON_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SOURCE_TILES = 6;
/** Drop slivers left by tile clipping and mapping errors; no house is smaller than this. */
const MIN_AREA_M2 = 6;

let template: { url: string; fetchedAt: number } | null = null;

async function tileUrlTemplate(signal: AbortSignal): Promise<string> {
  if (template && Date.now() - template.fetchedAt < TILEJSON_TTL_MS) return template.url;
  const res = await fetch(TILEJSON_URL, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`OpenFreeMap TileJSON HTTP ${res.status}`);
  const url = ((await res.json()) as { tiles?: string[] }).tiles?.[0];
  if (!url) throw new Error("OpenFreeMap TileJSON has no tile URL");
  template = { url, fetchedAt: Date.now() };
  return url;
}

const lonToX = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** ZOOM);
const latToY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM);
};
const xToLon = (x: number) => (x / 2 ** ZOOM) * 360 - 180;
const yToLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** ZOOM))) * 180) / Math.PI;

/** Building outlines inside the bbox, one Polygon per building. */
export async function fetchBuildingsFromTiles(bbox: Bbox, deadline: number): Promise<BuildingFeature[]> {
  const signal = AbortSignal.timeout(Math.max(1_000, deadline - Date.now()));
  const urlTemplate = await tileUrlTemplate(signal);

  const tiles: { x: number; y: number }[] = [];
  for (let x = lonToX(bbox.west); x <= lonToX(bbox.east); x++) {
    for (let y = latToY(bbox.north); y <= latToY(bbox.south); y++) tiles.push({ x, y });
  }
  if (tiles.length > MAX_SOURCE_TILES) throw new Error(`bbox spans ${tiles.length} source tiles`);

  const perTile = await Promise.all(
    tiles.map(async ({ x, y }) => {
      const url = urlTemplate.replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
      const res = await fetch(url, { signal, cache: "no-store" });
      if (res.status === 404 || res.status === 204) return []; // empty ocean tile
      if (!res.ok) throw new Error(`OpenFreeMap tile ${ZOOM}/${x}/${y} HTTP ${res.status}`);
      return decodeBuildings(new Uint8Array(await res.arrayBuffer()), x, y);
    }),
  );

  const seen = new Set<string>();
  const features: BuildingFeature[] = [];
  for (const f of perTile.flat()) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    features.push(f);
  }
  return features;
}

function decodeBuildings(buf: Uint8Array, x: number, y: number): BuildingFeature[] {
  const layer = new VectorTile(new PbfReader(buf)).layers.building;
  if (!layer) return [];

  // Tiles overlap by a small buffer; keep each building only in the tile holding its centroid.
  const west = xToLon(x);
  const east = xToLon(x + 1);
  const north = yToLat(y);
  const south = yToLat(y + 1);

  const out: BuildingFeature[] = [];
  for (let i = 0; i < layer.length; i++) {
    const geometry = layer.feature(i).toGeoJSON(x, y, ZOOM).geometry;
    // Buildings with the same attributes arrive merged into one MultiPolygon; each part is a building.
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates as Position[][]]
        : geometry.type === "MultiPolygon"
          ? (geometry.coordinates as Position[][][])
          : [];

    for (const rings of polygons) {
      const outer = rings[0];
      if (!outer || outer.length < 4 || approxRingAreaM2(outer) < MIN_AREA_M2) continue;
      const { lon, lat } = ringCentroid(outer);
      if (lon < west || lon >= east || lat > north || lat <= south) continue;

      // No per-building OSM id survives in the tiles, so the id is the rounded centroid: stable
      // across tiles and requests.
      const id = `b/${lat.toFixed(6)},${lon.toFixed(6)}`;
      out.push({
        type: "Feature",
        id,
        properties: { id, building: "yes" },
        geometry: { type: "Polygon", coordinates: rings.map(closeRing) },
      });
    }
  }
  return out;
}

function closeRing(ring: Position[]): Position[] {
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, a];
}

function approxRingAreaM2(ring: Position[]): number {
  const lat0 = (ring[0][1] * Math.PI) / 180;
  const kx = 111_320 * Math.cos(lat0);
  const ky = 110_574;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * kx * (ring[i + 1][1] * ky) - ring[i + 1][0] * kx * (ring[i][1] * ky);
  }
  return Math.abs(sum) / 2;
}
