import type { PanelCollection, PolygonGeometry, Position } from "@/lib/geo";

/** A building outline from OpenStreetMap. */
export interface BuildingFeature {
  type: "Feature";
  id: string;
  properties: { id: string; building: string; name?: string };
  geometry: { type: "Polygon"; coordinates: Position[][] };
}

/** JSON body returned by GET /api/plans/[id]. */
export interface SavedPlanResponse {
  id: string;
  name: string;
  osmId: string | null;
  targetMonthlyKwh: number;
  result: CalculateSolarResponse;
  footprint: PolygonGeometry;
}

/** JSON body returned by GET /api/buildings. */
export interface BuildingsResponse {
  type: "FeatureCollection";
  features: BuildingFeature[];
  /** Tiles whose buildings are included (possibly zero buildings). */
  loadedTiles: string[];
  /** Tiles that couldn't be fetched because every Overpass server failed; retry these later. */
  missingTiles: string[];
}

/** JSON body accepted by POST /api/calculate-solar. */
export interface CalculateSolarRequest {
  geometry: PolygonGeometry;
  monthlyKwh: number;
  osmId?: string;
}

/** JSON body returned by POST /api/calculate-solar. */
export interface CalculateSolarResponse {
  roofAreaM2: number;
  roofBearingDeg: number;
  layout: "along" | "across" | null;
  /** Most panels that fit on the roof. */
  maxPanels: number;
  maxSystemKw: number;
  maxMonthlyKwh: number;
  /** Panels needed for the target, capped at maxPanels. */
  recommendedPanels: number;
  systemCapacityKw: number;
  estMonthlyKwh: number;
  annualKwh: number;
  monthlyKwh: number[];
  /** PVWatts AC output for a 1 kWp system, Jan..Dec. Empty when nothing fits. Lets clients re-size locally. */
  monthlyKwhPerKw: number[];
  coveragePct: number;
  targetMonthlyKwh: number;
  tiltDeg: number;
  azimuthDeg: number;
  weatherStation: string | null;
  /**
   * Every panel that fits, sorted from the roof centre outwards; the first `recommendedPanels`
   * are flagged `recommended`. Install the first N of these for an N-panel system.
   */
  panels: PanelCollection;
  message?: string;
}
