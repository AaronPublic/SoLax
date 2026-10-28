"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MAX_TILES_PER_REQUEST, tilesForBbox } from "@/lib/tiles";
import type { BuildingsResponse } from "@/lib/types";
import type { PanelCollection, PolygonGeometry } from "@/lib/geo";
import { isWithinMapBounds, MAP_BOUNDS, MAP_CENTER } from "@/lib/config";
import RoofDrawer from "@/components/RoofDrawer";
import styles from "./SolarMap.module.css";

const MIN_FETCH_ZOOM = 17;
const IDLE_DEBOUNCE_MS = 400;
/** Fetch a bit beyond the viewport so small pans don't trigger new Overpass requests. */
const FETCH_PADDING = 0.15;
/** Backoff while every Overpass server is busy: 15 s, 30 s, 60 s, then every 2 min. */
const RETRY_START_MS = 15_000;
const RETRY_MAX_MS = 120_000;

export interface RoofSelection {
  osmId: string;
  geometry: PolygonGeometry;
}

interface Props {
  /** Every panel slot that fits, sorted centre-out (feature property `index`). */
  panels: PanelCollection | null;
  /** The first N slots are drawn as installed panels; the rest as "also fits". */
  recommendedCount: number;
  /** The selected roof, outlined in amber. */
  roof: PolygonGeometry | null;
  /** Centre the map on this geometry whenever `key` changes (opening a saved plan). */
  focus: MapFocus | null;
  onSelect: (roof: RoofSelection) => void;
  /** Outline tool: draw a new roof (`initial` null) or adjust `initial`. Null when inactive. */
  draw: DrawRequest | null;
  onDrawDone: (geometry: PolygonGeometry) => void;
  onDrawCancel: () => void;
  /** Small screens only: shown above the legend, in place of its colour key. */
  overlay?: ReactNode;
}

export interface DrawRequest {
  initial: PolygonGeometry | null;
  /** Changes for each new drawing session. */
  key: string;
}

export interface MapFocus {
  geometry: PolygonGeometry;
  key: string;
}

/** Zoom used when jumping to a roof: close enough to see individual panels. */
const FOCUS_ZOOM = 19;

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
let loaderConfigured = false;

const ACCENT = "#f97316";
const PANEL_FILL = "#ffffff";

/**
 * Buildings: invisible until hovered (orange). Touch screens can't hover, so there they're faintly
 * outlined to show what can be tapped. Not clickable while the outline tool is open.
 */
const buildingStyle = (clickable: boolean, touch: boolean): google.maps.Data.StyleOptions => ({
  fillColor: ACCENT,
  fillOpacity: touch ? 0.08 : 0,
  strokeColor: ACCENT,
  strokeOpacity: touch ? 0.6 : 0,
  strokeWeight: 1,
  cursor: "pointer",
  clickable,
  zIndex: 1,
});

const NO_HOVER = "(hover: none)";
const subscribeNoHover = (onChange: () => void) => {
  const query = window.matchMedia(NO_HOVER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** True on touch-only devices. False during server rendering. */
function useTouchScreen(): boolean {
  return useSyncExternalStore(subscribeNoHover, () => window.matchMedia(NO_HOVER).matches, () => false);
}

/** How long a one-off message (e.g. a location error) stays in the status pill. */
const NOTICE_MS = 6_000;

type Status = { kind: "idle" | "loading" | "zoom" | "error"; text?: string };

function panelStyle(recommended: number): google.maps.Data.StylingFunction {
  return (f) => {
    const on = Number(f.getProperty("index")) < recommended;
    return on
      ? { fillColor: PANEL_FILL, fillOpacity: 0.92, strokeColor: ACCENT, strokeOpacity: 0.9, strokeWeight: 0.6, clickable: false, zIndex: 3 }
      : { fillColor: "#ffffff", fillOpacity: 0.06, strokeColor: "#ffffff", strokeOpacity: 0.55, strokeWeight: 0.6, clickable: false, zIndex: 2 };
  };
}

export default function SolarMap({ panels, recommendedCount, roof, focus, onSelect, draw, onDrawDone, onDrawCancel, overlay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelLayerRef = useRef<google.maps.Data | null>(null);
  const roofLayerRef = useRef<google.maps.Data | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const mapReady = mapInstance !== null;
  const drawing = draw !== null;
  const onSelectRef = useRef(onSelect);
  const recommendedRef = useRef(recommendedCount);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [buildingCount, setBuildingCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const touch = useTouchScreen();
  const mapError = API_KEY ? loadError : "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set.";

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // One-time map setup.
  useEffect(() => {
    const apiKey = API_KEY;
    if (!apiKey) return;
    // Google calls this global when the key is rejected (API not enabled, billing, referrer restrictions).
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () =>
      setLoadError(
        "Google rejected the Maps API key. In Google Cloud Console, enable the Maps JavaScript API and billing " +
          "for the key's project, and allow http://localhost:3000/* if the key is restricted. " +
          "The browser console names the exact error.",
      );
    if (!loaderConfigured) {
      setOptions({ key: apiKey, v: "weekly", region: "PH" });
      loaderConfigured = true;
    }

    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let inflight: AbortController | null = null;
    const listeners: google.maps.MapsEventListener[] = [];
    // Tiles whose buildings are already on the map (see lib/tiles.ts).
    const loadedTiles = new Set<string>();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = RETRY_START_MS;

    (async () => {
      const { Map, Data } = await importLibrary("maps");
      if (cancelled || !containerRef.current) return;

      const map = new Map(containerRef.current, {
        center: MAP_CENTER,
        zoom: 17,
        // Low enough to travel across the archipelago; buildings still only load from MIN_FETCH_ZOOM.
        minZoom: 5,
        mapTypeId: "satellite",
        tilt: 0,
        heading: 0,
        restriction: { latLngBounds: MAP_BOUNDS, strictBounds: true },
        clickableIcons: false,
        streetViewControl: false,
        mapTypeControl: false,
        rotateControl: false,
        fullscreenControl: false,
        zoomControl: false,
        cameraControl: false,
        gestureHandling: "greedy",
      });
      mapRef.current = map;

      listeners.push(
        map.data.addListener("mouseover", (e: google.maps.Data.MouseEvent) => {
          map.data.overrideStyle(e.feature, { fillOpacity: 0.45, strokeOpacity: 0.9 });
        }),
        map.data.addListener("mouseout", (e: google.maps.Data.MouseEvent) => {
          map.data.revertStyle(e.feature);
        }),
        map.data.addListener("click", (e: google.maps.Data.MouseEvent) => {
          const osmId = String(e.feature.getId());
          e.feature.toGeoJson((json) => {
            const geometry = (json as { geometry?: PolygonGeometry }).geometry;
            if (geometry?.type === "Polygon") {
              onSelectRef.current({ osmId, geometry });
            }
          });
        }),
      );

      // Panels sit above the buildings but let clicks fall through to them.
      panelLayerRef.current = new Data({ map, style: panelStyle(recommendedRef.current) });
      // The selected roof gets its own layer so it shows even before its building tile loads
      // (e.g. a reopened plan).
      roofLayerRef.current = new Data({
        map,
        style: { fillOpacity: 0, strokeColor: ACCENT, strokeOpacity: 1, strokeWeight: 3, clickable: false, zIndex: 4 },
      });
      setMapInstance(map);

      const loadBuildings = async () => {
        const zoom = map.getZoom() ?? 0;
        const bounds = map.getBounds();
        if (!bounds) return;
        if (zoom < MIN_FETCH_ZOOM) {
          setStatus({ kind: "zoom", text: "Zoom in to load buildings" });
          return;
        }

        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const padLat = (ne.lat() - sw.lat()) * FETCH_PADDING;
        const padLng = (ne.lng() - sw.lng()) * FETCH_PADDING;
        const wanted = tilesForBbox({
          south: sw.lat() - padLat,
          west: sw.lng() - padLng,
          north: ne.lat() + padLat,
          east: ne.lng() + padLng,
        })
          .filter((k) => !loadedTiles.has(k))
          .slice(0, MAX_TILES_PER_REQUEST);
        if (wanted.length === 0) {
          setStatus({ kind: "idle" });
          return;
        }

        clearTimeout(retryTimer);
        inflight?.abort();
        const controller = new AbortController();
        inflight = controller;
        setStatus({ kind: "loading", text: "Loading buildings…" });

        const scheduleRetry = () => {
          const delay = retryDelay;
          retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
          setStatus({ kind: "error", text: `OpenStreetMap servers are busy. Retrying in ${delay / 1000} s…` });
          retryTimer = setTimeout(loadBuildings, delay);
        };

        try {
          const res = await fetch(`/api/buildings?tiles=${wanted.join(",")}`, { signal: controller.signal });
          if (!res.ok) throw new Error(`Buildings HTTP ${res.status}`);
          const data = (await res.json()) as BuildingsResponse;
          if (cancelled) return;

          const fresh = data.features.filter((f) => !map.data.getFeatureById(f.id));
          if (fresh.length) {
            map.data.addGeoJson({ type: "FeatureCollection", features: fresh }, { idPropertyName: "id" });
            setBuildingCount((n) => n + fresh.length);
          }
          data.loadedTiles.forEach((k) => loadedTiles.add(k));

          if (data.missingTiles.length) {
            scheduleRetry();
          } else {
            retryDelay = RETRY_START_MS;
            setStatus({ kind: "idle" });
          }
        } catch (err) {
          if (controller.signal.aborted || cancelled) return;
          console.error(err);
          scheduleRetry();
        } finally {
          if (inflight === controller) inflight = null;
        }
      };

      listeners.push(
        map.addListener("idle", () => {
          clearTimeout(debounce);
          debounce = setTimeout(loadBuildings, IDLE_DEBOUNCE_MS);
        }),
      );
    })().catch((err) => {
      console.error(err);
      if (!cancelled) setLoadError("Google Maps failed to load. Check the API key and its allowed referrers.");
    });

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(retryTimer);
      inflight?.abort();
      listeners.forEach((l) => l.remove());
      panelLayerRef.current?.setMap(null);
      panelLayerRef.current = null;
      roofLayerRef.current?.setMap(null);
      roofLayerRef.current = null;
      mapRef.current = null;
      setMapInstance(null);
    };
  }, []);

  // While the outline tool is open: buildings ignore clicks (the map takes them as corners) and
  // the current roof and panels step aside so they don't hide the photo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawing) return;
    panelLayerRef.current?.setMap(null);
    roofLayerRef.current?.setMap(null);
    return () => {
      panelLayerRef.current?.setMap(map);
      roofLayerRef.current?.setMap(map);
    };
  }, [drawing, mapReady]);

  useEffect(() => {
    mapRef.current?.data.setStyle(buildingStyle(!drawing, touch));
  }, [drawing, touch, mapReady]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const locate = () => {
    const map = mapRef.current;
    if (!map) return;
    if (!("geolocation" in navigator)) {
      setNotice("This browser can't share your location. Move the map to your home instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (!isWithinMapBounds(coords.longitude, coords.latitude)) {
          setNotice("You seem to be outside the Philippines. Move the map to your home instead.");
          return;
        }
        map.setCenter({ lat: coords.latitude, lng: coords.longitude });
        map.setZoom(FOCUS_ZOOM);
      },
      (err) => {
        setLocating(false);
        setNotice(
          err.code === err.PERMISSION_DENIED
            ? "Location access is off. Allow it in your browser, or move the map yourself."
            : "Couldn't find your location. Move the map to your home instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  // Draw the fitted panels.
  useEffect(() => {
    const layer = panelLayerRef.current;
    if (!layer) return;
    layer.forEach((f) => layer.remove(f));
    if (panels?.features.length) layer.addGeoJson(panels);
  }, [panels, mapReady]);

  // Outline the selected roof.
  useEffect(() => {
    const layer = roofLayerRef.current;
    if (!layer) return;
    layer.forEach((f) => layer.remove(f));
    if (roof) layer.addGeoJson({ type: "Feature", properties: {}, geometry: roof });
  }, [roof, mapReady]);

  // Jump to a roof (opening a saved plan, or returning from login).
  const focusKey = focus?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const ring = focus.geometry.coordinates[0];
    const lngs = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    map.setCenter({ lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 });
    map.setZoom(FOCUS_ZOOM);
    // Only re-centre when a new focus is requested, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, mapReady]);

  // Re-style (not re-add) when the user changes their consumption.
  useEffect(() => {
    recommendedRef.current = recommendedCount;
    panelLayerRef.current?.setStyle(panelStyle(recommendedCount));
  }, [recommendedCount, mapReady]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (map) map.setZoom((map.getZoom() ?? 17) + delta);
  };

  const pill = notice
    ? { text: notice, dot: styles.dotError }
    : status.kind === "idle"
      ? buildingCount > 0
        ? { text: `${buildingCount.toLocaleString()} buildings loaded`, dot: styles.dotOk }
        : null
      : { text: status.text ?? "", dot: status.kind === "error" ? styles.dotError : status.kind === "loading" ? styles.dotBusy : styles.dotIdle };

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />
      {mapError && <div className={styles.overlayError}>{mapError}</div>}

      {draw && mapInstance && (
        <RoofDrawer key={draw.key} map={mapInstance} initial={draw.initial} onDone={onDrawDone} onCancel={onDrawCancel} />
      )}

      {/* The outline tool's toolbar takes the top of the map while it's open. */}
      {pill && !drawing && (
        <div className={styles.status} role="status">
          <span className={`${styles.dot} ${pill.dot}`} aria-hidden="true" />
          {pill.text}
        </div>
      )}

      <div className={styles.controls}>
        <div className={styles.group}>
          <button
            type="button"
            aria-label="Go to my location"
            title="Go to my location"
            onClick={locate}
            disabled={!mapReady || locating}
            aria-busy={locating}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
        </div>
        <div className={styles.group}>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.bottom}>
        {overlay && <div className={styles.overlay}>{overlay}</div>}
        <div className={styles.legend}>
          <div className={styles.legendItems}>
            <span>
              <span className={styles.swatchHover} aria-hidden="true" />
              {touch ? "Tap a roof to select it" : "Hover to highlight"}
            </span>
            <span>
              <span className={styles.swatchPanel} aria-hidden="true" />
              Recommended panel
            </span>
            <span>
              <span className={styles.swatchSlot} aria-hidden="true" />
              Also fits
            </span>
          </div>
          <div className={styles.attribution}>
            Buildings ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>{" "}
            via{" "}
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
