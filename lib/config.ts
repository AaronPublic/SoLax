// The app is limited to the Philippines. Both settings can be narrowed via env:
//   NEXT_PUBLIC_MAP_BOUNDS="south,west,north,east"   NEXT_PUBLIC_MAP_CENTER="lat,lng"
const PHILIPPINES_BOUNDS = "4.5,116.9,21.2,126.7";
const MANILA = "14.5995,120.9842";

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

function parseNumbers(raw: string | undefined, fallback: string, count: number): number[] {
  const parts = (raw ?? fallback).split(",").map(Number);
  return parts.length === count && parts.every(Number.isFinite) ? parts : fallback.split(",").map(Number);
}

const [south, west, north, east] = parseNumbers(process.env.NEXT_PUBLIC_MAP_BOUNDS, PHILIPPINES_BOUNDS, 4);
export const MAP_BOUNDS: Bounds = { south, west, north, east };

const [lat, lng] = parseNumbers(process.env.NEXT_PUBLIC_MAP_CENTER, MANILA, 2);
export const MAP_CENTER = { lat, lng };

export function isWithinMapBounds(lon: number, lat: number): boolean {
  return lat >= MAP_BOUNDS.south && lat <= MAP_BOUNDS.north && lon >= MAP_BOUNDS.west && lon <= MAP_BOUNDS.east;
}
