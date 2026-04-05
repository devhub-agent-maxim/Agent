import axios from 'axios';

export const MAX_OSRM_STOPS = 100;

const OSRM_BASE_URL = 'http://router.project-osrm.org/table/v1/driving';
const DEFAULT_TIMEOUT_MS = 3000;

export interface OsrmTableResult {
  /** Drive-time in seconds between all coordinate pairs [i][j] */
  durations: number[][];
  /** Road distance in metres between all coordinate pairs [i][j] */
  distances: number[][];
}

/**
 * Calls the OSRM Table API to get a real road-network distance/duration matrix.
 *
 * @param coords - Array of {lat, lng} coordinates
 * @param timeoutMs - Abort after this many milliseconds (default 3000)
 * @returns OsrmTableResult or null if OSRM is unavailable, times out, or there
 *          are more than MAX_OSRM_STOPS coordinates (public server limit).
 */
export async function getOsrmMatrix(
  coords: Array<{ lat: number; lng: number }>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OsrmTableResult | null> {
  if (coords.length === 0 || coords.length > MAX_OSRM_STOPS) {
    return null;
  }

  const coordString = coords.map((c) => `${c.lng},${c.lat}`).join(';');
  const url = `${OSRM_BASE_URL}/${coordString}?annotations=duration,distance`;

  try {
    const response = await axios.get<{
      code: string;
      durations: number[][];
      distances: number[][];
    }>(url, {
      timeout: timeoutMs,
      headers: { Accept: 'application/json' },
    });

    if (response.data.code !== 'Ok') {
      return null;
    }

    return {
      durations: response.data.durations,
      distances: response.data.distances,
    };
  } catch {
    // Network error, timeout, or non-2xx response — fall back to haversine
    return null;
  }
}
