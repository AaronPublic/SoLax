// Fixed lat/lng grid used to request and cache building outlines. Shared by client and server.

/** Tile edge in degrees: ~550 m, small enough that a dense Manila tile stays a few hundred KB. */
export const TILE_DEG = 0.005;
/** Upper bound on tiles per request (a zoom-17 view on a 4K screen needs ~24). */
export const MAX_TILES_PER_REQUEST = 36;

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const TILE_KEY = /^-?\d{1,6}_-?\d{1,6}$/;

export function tileKey(ix: number, iy: number): string {
  return `${ix}_${iy}`;
}

export function isTileKey(key: string): boolean {
  return TILE_KEY.test(key);
}

export function parseTileKey(key: string): { ix: number; iy: number } {
  const [ix, iy] = key.split("_").map(Number);
  return { ix, iy };
}

export function tileBbox(key: string): Bbox {
  const { ix, iy } = parseTileKey(key);
  return { west: ix * TILE_DEG, south: iy * TILE_DEG, east: (ix + 1) * TILE_DEG, north: (iy + 1) * TILE_DEG };
}

export function tileOf(lon: number, lat: number): string {
  return tileKey(Math.floor(lon / TILE_DEG), Math.floor(lat / TILE_DEG));
}

export function tilesForBbox(b: Bbox): string[] {
  const keys: string[] = [];
  for (let iy = Math.floor(b.south / TILE_DEG); iy <= Math.floor(b.north / TILE_DEG); iy++) {
    for (let ix = Math.floor(b.west / TILE_DEG); ix <= Math.floor(b.east / TILE_DEG); ix++) {
      keys.push(tileKey(ix, iy));
    }
  }
  return keys;
}

/** Smallest bbox covering all the given tiles. */
export function unionBbox(keys: string[]): Bbox {
  const boxes = keys.map(tileBbox);
  return {
    south: Math.min(...boxes.map((b) => b.south)),
    west: Math.min(...boxes.map((b) => b.west)),
    north: Math.max(...boxes.map((b) => b.north)),
    east: Math.max(...boxes.map((b) => b.east)),
  };
}
