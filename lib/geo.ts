// Minimal GeoJSON types shared by the client and the API route.

export type Position = [number, number] | [number, number, number];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Position[][];
}

export interface PanelFeature {
  type: "Feature";
  properties: { index: number; recommended: boolean };
  geometry: PolygonGeometry;
}

export interface PanelCollection {
  type: "FeatureCollection";
  features: PanelFeature[];
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Vertex-average centroid of the outer ring. Good enough for a single roof. */
export function ringCentroid(ring: Position[]): { lon: number; lat: number } {
  const pts = isClosed(ring) ? ring.slice(0, -1) : ring;
  let lon = 0;
  let lat = 0;
  for (const [x, y] of pts) {
    lon += x;
    lat += y;
  }
  return { lon: lon / pts.length, lat: lat / pts.length };
}

/**
 * EPSG code of the WGS 84 / UTM zone containing the point. Unlike EPSG:3857, UTM keeps
 * true metre distances (≤0.04% scale error), so a 2 m panel is actually 2 m on the ground.
 */
export function utmSrid(lon: number, lat: number): number {
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  return (lat >= 0 ? 32600 : 32700) + zone;
}

/** Approximate polygon area in m² using a local equirectangular projection. */
export function approxAreaM2(geometry: PolygonGeometry): number {
  const { lat } = ringCentroid(geometry.coordinates[0]);
  const kx = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180);
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;
  const ringArea = (ring: Position[]) => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      sum += ring[i][0] * kx * (ring[i + 1][1] * ky) - ring[i + 1][0] * kx * (ring[i][1] * ky);
    }
    return Math.abs(sum) / 2;
  };
  const [outer, ...holes] = geometry.coordinates;
  return ringArea(outer) - holes.reduce((acc, h) => acc + ringArea(h), 0);
}

export function isClosed(ring: Position[]): boolean {
  const a = ring[0];
  const b = ring[ring.length - 1];
  return ring.length > 1 && a[0] === b[0] && a[1] === b[1];
}
