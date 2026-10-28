"use client";

import { useEffect, useRef, useState } from "react";
import { approxAreaM2, type PolygonGeometry, type Position } from "@/lib/geo";
import styles from "./RoofDrawer.module.css";

const ACCENT = "#f97316";
/** Smaller than any roof that fits a 2 m x 1 m panel plus setback; catches accidental clicks. */
const MIN_AREA_M2 = 4;

interface Props {
  map: google.maps.Map;
  /** Outline to adjust; without it the user draws a new one corner by corner. */
  initial: PolygonGeometry | null;
  onDone: (geometry: PolygonGeometry) => void;
  onCancel: () => void;
}

interface Actions {
  undo: () => void;
  finish: () => void;
  restart: () => void;
  geometry: () => PolygonGeometry | null;
}

/**
 * Lets the user trace a roof on the satellite image (click each corner) or adjust an existing
 * outline (drag corners, drag a midpoint to add one, right-click a corner to remove it).
 * Built on plain Polyline/Polygon overlays: Google's Drawing Library was retired in 2026.
 */
export default function RoofDrawer({ map, initial, onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<"drawing" | "editing">(initial ? "editing" : "drawing");
  const [corners, setCorners] = useState(initial ? openRing(initial.coordinates[0]).length : 0);
  const [area, setArea] = useState(initial ? approxAreaM2(initial) : 0);
  const [error, setError] = useState<string | null>(null);
  const actions = useRef<Actions | null>(null);
  const callbacks = useRef({ onDone, onCancel });

  useEffect(() => {
    callbacks.current = { onDone, onCancel };
  }, [onDone, onCancel]);

  useEffect(() => {
    const listeners: google.maps.MapsEventListener[] = [];
    let line: google.maps.Polyline | null = null;
    let guide: google.maps.Polyline | null = null;
    let polygon: google.maps.Polygon | null = null;
    let polygonListeners: google.maps.MapsEventListener[] = [];

    map.setOptions({ draggableCursor: "crosshair", disableDoubleClickZoom: true });

    const toGeometry = (path: google.maps.LatLng[]): PolygonGeometry => {
      const ring: Position[] = path.map((p) => [p.lng(), p.lat()]);
      return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
    };

    const startEditing = (path: google.maps.LatLng[]) => {
      polygon = new google.maps.Polygon({
        map,
        paths: path,
        editable: true,
        strokeColor: ACCENT,
        strokeWeight: 3,
        fillColor: ACCENT,
        fillOpacity: 0.22,
        zIndex: 20,
      });
      map.setOptions({ draggableCursor: null });

      const refresh = () => {
        const p = polygon!.getPath().getArray();
        setCorners(p.length);
        setArea(p.length >= 3 ? approxAreaM2(toGeometry(p)) : 0);
        setError(null);
      };
      const mvc = polygon.getPath();
      polygonListeners = [
        mvc.addListener("set_at", refresh),
        mvc.addListener("insert_at", refresh),
        mvc.addListener("remove_at", refresh),
        polygon.addListener("rightclick", (e: google.maps.PolyMouseEvent) => {
          if (e.vertex !== undefined && mvc.getLength() > 3) mvc.removeAt(e.vertex);
        }),
      ];
    };

    const startDrawing = () => {
      line = new google.maps.Polyline({ map, editable: true, strokeColor: ACCENT, strokeWeight: 3, zIndex: 20 });
      guide = new google.maps.Polyline({
        map,
        clickable: false,
        strokeOpacity: 0,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: ACCENT, strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "10px" }],
        zIndex: 19,
      });
      const path = line.getPath();

      listeners.push(
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          path.push(e.latLng);
          setCorners(path.getLength());
          setError(null);
        }),
        map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
          const n = path.getLength();
          if (e.latLng && n > 0) guide!.setPath([path.getAt(n - 1), e.latLng]);
        }),
        // Clicking the first corner closes the outline.
        line.addListener("click", (e: google.maps.PolyMouseEvent) => {
          if (e.vertex === 0) finish();
        }),
        path.addListener("set_at", () => setCorners(path.getLength())),
      );
    };

    const finish = () => {
      if (!line) return;
      const path = line.getPath().getArray();
      if (path.length < 3) {
        setError("Add at least 3 corners.");
        return;
      }
      line.setMap(null);
      guide?.setMap(null);
      line = guide = null;
      listeners.splice(0).forEach((l) => l.remove());
      startEditing(path);
      setPhase("editing");
      setCorners(path.length);
      setArea(approxAreaM2(toGeometry(path)));
    };

    const clearAll = () => {
      line?.setMap(null);
      guide?.setMap(null);
      polygon?.setMap(null);
      line = guide = polygon = null;
      listeners.splice(0).forEach((l) => l.remove());
      polygonListeners.splice(0).forEach((l) => l.remove());
    };

    actions.current = {
      undo: () => {
        const path = line?.getPath();
        if (!path || path.getLength() === 0) return;
        path.pop();
        setCorners(path.getLength());
        const n = path.getLength();
        guide?.setPath(n > 0 ? [path.getAt(n - 1)] : []);
      },
      finish,
      restart: () => {
        clearAll();
        map.setOptions({ draggableCursor: "crosshair" });
        startDrawing();
        setPhase("drawing");
        setCorners(0);
        setArea(0);
        setError(null);
      },
      geometry: () => (polygon ? toGeometry(polygon.getPath().getArray()) : null),
    };

    if (initial) {
      startEditing(openRing(initial.coordinates[0]).map(([lng, lat]) => new google.maps.LatLng(lat, lng)));
    } else {
      startDrawing();
    }

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (e.key === "Escape") callbacks.current.onCancel();
      else if (e.key === "Enter") {
        if (line) finish();
        else document.getElementById("roof-drawer-done")?.click();
      }
      else if ((e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey))) && line) {
        e.preventDefault();
        actions.current?.undo();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      clearAll();
      map.setOptions({ draggableCursor: null, disableDoubleClickZoom: false });
    };
    // The drawer is remounted (keyed) for each new session; `initial` is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const done = () => {
    const geometry = actions.current?.geometry();
    if (!geometry) return;
    if (approxAreaM2(geometry) < MIN_AREA_M2) {
      setError("That outline is too small for a roof. Adjust the corners or start over.");
      return;
    }
    onDone(geometry);
  };

  return (
    <div className={styles.toolbar} role="region" aria-label="Roof outline tool">
      <p className={styles.instructions}>
        {phase === "drawing" ? (
          <>
            <strong>Click each corner of your roof</strong> on the photo. Click the first corner again, or press Finish, to
            close the outline.
          </>
        ) : (
          <>
            <strong>Drag the corners</strong> to match your roof. Drag a midpoint to add a corner; right-click a corner to
            remove it.
          </>
        )}
      </p>
      <div className={styles.meta}>
        {corners} corner{corners === 1 ? "" : "s"}
        {phase === "editing" && area > 0 && <> · {Math.round(area).toLocaleString()} m²</>}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.buttons}>
        {phase === "drawing" ? (
          <>
            <button type="button" className={styles.secondary} onClick={() => actions.current?.undo()} disabled={corners === 0}>
              Undo
            </button>
            <button type="button" className={styles.primary} onClick={() => actions.current?.finish()} disabled={corners < 3}>
              Finish
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={() => actions.current?.restart()}>
              Start over
            </button>
            <button type="button" id="roof-drawer-done" className={styles.primary} onClick={done}>
              Use this outline
            </button>
          </>
        )}
        <button type="button" className={styles.ghost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Ring without the repeated closing point. */
function openRing(ring: Position[]): Position[] {
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return ring.length > 1 && a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
}
