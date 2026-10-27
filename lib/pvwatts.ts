import "server-only";

// NREL became the National Laboratory of the Rockies; its developer APIs now live on developer.nlr.gov.
const DEFAULT_BASE_URL = "https://developer.nlr.gov/api/pvwatts/v8.json";

export interface PvwattsInput {
  systemCapacityKw: number;
  lat: number;
  lon: number;
  tiltDeg: number;
  azimuthDeg: number;
  lossesPct?: number;
}

export interface PvwattsResult {
  acMonthlyKwh: number[]; // 12 values, Jan..Dec
  acAnnualKwh: number;
  stationLocation: string | null;
  weatherSource: string | null;
}

export class PvwattsError extends Error {}

interface PvwattsResponse {
  errors?: string[];
  outputs?: { ac_monthly?: number[]; ac_annual?: number };
  station_info?: { city?: string; state?: string; country?: string; weather_data_source?: string };
}

export async function fetchPvwatts(input: PvwattsInput): Promise<PvwattsResult> {
  const apiKey = process.env.NREL_API_KEY;
  if (!apiKey) throw new PvwattsError("NREL_API_KEY is not set");

  const params = new URLSearchParams({
    api_key: apiKey,
    system_capacity: String(input.systemCapacityKw),
    module_type: "0", // standard crystalline silicon
    losses: String(input.lossesPct ?? 14),
    array_type: "1", // fixed, roof mounted
    tilt: String(input.tiltDeg),
    azimuth: String(input.azimuthDeg),
    lat: input.lat.toFixed(6),
    lon: input.lon.toFixed(6),
    timeframe: "monthly",
  });

  const res = await fetch(`${process.env.PVWATTS_URL ?? DEFAULT_BASE_URL}?${params}`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new PvwattsError(`PVWatts request failed: ${err instanceof Error ? err.message : err}`);
  });

  const body = (await res.json().catch(() => null)) as PvwattsResponse | null;
  if (!res.ok || !body || body.errors?.length) {
    const detail = body?.errors?.join("; ") || `HTTP ${res.status}`;
    throw new PvwattsError(`PVWatts error: ${detail}`);
  }

  const monthly = body.outputs?.ac_monthly;
  if (!monthly || monthly.length !== 12 || typeof body.outputs?.ac_annual !== "number") {
    throw new PvwattsError("PVWatts returned no monthly output");
  }

  const s = body.station_info;
  return {
    acMonthlyKwh: monthly,
    acAnnualKwh: body.outputs.ac_annual,
    stationLocation: s ? [s.city, s.state, s.country].filter(Boolean).join(", ") || null : null,
    weatherSource: s?.weather_data_source ?? null,
  };
}
