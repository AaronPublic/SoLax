import "server-only";
import { db } from "@/lib/prisma";
import type { PolygonGeometry } from "@/lib/geo";
import { PANEL } from "@/lib/sizing";

/** Clearance kept free along the roof edge (fire-code style access path). */
export const EDGE_SETBACK_M = 0.5;
/** Spacing between adjacent modules (clamps / thermal expansion). */
export const PANEL_GAP_M = 0.02;

export interface PanelFitResult {
  roofAreaM2: number;
  /** Bearing of the roof's long axis, degrees clockwise from north (0-180). */
  roofBearingDeg: number;
  /** "along" = 2 m side parallel to the roof's long axis, "across" = rotated 90°. */
  layout: "along" | "across" | null;
  /** Panel polygons in EPSG:4326, sorted from the roof centre outwards. */
  panels: PolygonGeometry[];
}

interface Row {
  roof_area_m2: number;
  roof_bearing_deg: number;
  layout: number | null;
  panels: PolygonGeometry[];
}

/**
 * Lays a grid of panels over the roof, aligned to the roof's dominant direction, and keeps
 * only the panels that sit entirely inside the roof after the edge setback.
 *
 * All geometry work happens in the local UTM zone (`srid`) so dimensions are in true metres.
 */
export async function fitPanels(geometry: PolygonGeometry, srid: number): Promise<PanelFitResult | null> {
  const geojson = JSON.stringify(geometry);

  const rows = await db().$queryRaw<Row[]>`
    WITH
    roof AS (
      SELECT ST_CollectionExtract(
               ST_MakeValid(ST_Transform(ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(${geojson}::text)), 4326), ${srid}::int)),
               3) AS g
    ),
    -- Long side of the minimum-area bounding rectangle = the roof's main axis.
    ring AS (
      SELECT g, ST_Centroid(g) AS c, ST_ExteriorRing(ST_OrientedEnvelope(g)) AS r
      FROM roof
      WHERE NOT ST_IsEmpty(g)
    ),
    axis AS (
      SELECT ST_Azimuth(ST_PointN(r, n), ST_PointN(r, n + 1)) AS az
      FROM ring, generate_series(1, 2) AS n
      ORDER BY ST_Distance(ST_PointN(r, n), ST_PointN(r, n + 1)) DESC
      LIMIT 1
    ),
    -- Rotate the usable roof area so its main axis lies along +X; the grid can then be axis-aligned.
    -- ST_Azimuth is clockwise from north, ST_Rotate is counter-clockwise, hence theta = pi/2 - az.
    frame AS (
      SELECT ring.c,
             ST_Area(ring.g) AS area,
             axis.az,
             pi() / 2 - axis.az AS theta,
             ST_Rotate(ST_Buffer(ring.g, -${EDGE_SETBACK_M}::float8), -(pi() / 2 - axis.az), ring.c) AS usable
      FROM ring, axis
    ),
    -- Candidate grids: 2 panel orientations x 4 phase shifts (0 or half a step in x/y).
    -- The best one wins; shifting matters on L-shaped and irregular roofs.
    variants AS (
      SELECT row_number() OVER () AS variant, s.layout, s.w, s.h, o.fx, o.fy
      FROM (VALUES
        (1, ${PANEL.lengthM}::float8, ${PANEL.widthM}::float8),
        (2, ${PANEL.widthM}::float8, ${PANEL.lengthM}::float8)
      ) AS s(layout, w, h)
      CROSS JOIN (VALUES (0.0::float8, 0.0::float8), (0.5, 0.0), (0.0, 0.5), (0.5, 0.5)) AS o(fx, fy)
    ),
    grids AS (
      SELECT v.variant, v.layout, v.w, v.h, f.usable,
             v.w + ${PANEL_GAP_M}::float8 AS sx,
             v.h + ${PANEL_GAP_M}::float8 AS sy,
             ST_XMax(f.usable) - ST_XMin(f.usable) AS bw,
             ST_YMax(f.usable) - ST_YMin(f.usable) AS bh,
             v.fx, v.fy
      FROM frame f CROSS JOIN variants v
      WHERE NOT ST_IsEmpty(f.usable)
    ),
    origins AS (
      -- Centre the grid in the bounding box so leftover space is split evenly on both sides
      -- (this also keeps edge cells clear of floating-point noise on exact-fit edges).
      SELECT g.*,
             floor((g.bw + ${PANEL_GAP_M}::float8) / g.sx)::int AS nx,
             floor((g.bh + ${PANEL_GAP_M}::float8) / g.sy)::int AS ny,
             ST_XMin(g.usable) + (g.bw - (floor((g.bw + ${PANEL_GAP_M}::float8) / g.sx) * g.sx - ${PANEL_GAP_M}::float8)) / 2
               - g.fx * g.sx AS x0,
             ST_YMin(g.usable) + (g.bh - (floor((g.bh + ${PANEL_GAP_M}::float8) / g.sy) * g.sy - ${PANEL_GAP_M}::float8)) / 2
               - g.fy * g.sy AS y0
      FROM grids g
    ),
    cells AS (
      SELECT o.variant, o.layout,
             ST_MakeEnvelope(o.x0 + i * o.sx, o.y0 + j * o.sy,
                             o.x0 + i * o.sx + o.w, o.y0 + j * o.sy + o.h, ST_SRID(o.usable)) AS cell
      FROM origins o
      -- A half-step shift can make room for one more row/column, hence the +1.
      CROSS JOIN generate_series(0, o.nx - 1 + ceil(o.fx)::int) AS i
      CROSS JOIN generate_series(0, o.ny - 1 + ceil(o.fy)::int) AS j
    ),
    fitted AS (
      -- 1 mm tolerance absorbs rounding from the rotate/transform round trip.
      SELECT c.variant, c.layout, c.cell
      FROM cells c, (SELECT ST_Buffer(usable, 0.001, 'join=mitre') AS g FROM frame) AS area
      WHERE ST_CoveredBy(c.cell, area.g)
    ),
    best AS (
      SELECT variant, layout FROM fitted GROUP BY variant, layout ORDER BY count(*) DESC, variant LIMIT 1
    )
    SELECT
      f.area::float8 AS roof_area_m2,
      degrees(f.az)::float8 AS roof_bearing_deg,
      (SELECT layout FROM best)::int AS layout,
      COALESCE((
        SELECT json_agg(
                 ST_AsGeoJSON(ST_Transform(ST_Rotate(p.cell, f.theta, f.c), 4326), 8)::json
                 ORDER BY ST_Distance(ST_Centroid(p.cell), f.c), ST_YMin(p.cell), ST_XMin(p.cell))
        FROM fitted p JOIN best USING (variant)
      ), '[]'::json) AS panels
    FROM frame f
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    roofAreaM2: row.roof_area_m2,
    roofBearingDeg: ((row.roof_bearing_deg % 180) + 180) % 180,
    layout: row.layout === 1 ? "along" : row.layout === 2 ? "across" : null,
    panels: row.panels,
  };
}
