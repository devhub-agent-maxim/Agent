import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { MapsClient } from "@/maps/client";
import { Geocoder } from "@/maps/geocoder";
import { MultiDriverPlanner } from "@/routes/multi-driver";
import { DeliveryStop } from "@/maps/types";
import { RouteOptimizer, DistanceMatrix } from "@/routes/optimizer";
import { getOsrmMatrix, MAX_OSRM_STOPS, OsrmTableResult } from "@/lib/osrm-client";

interface OptimizeRequestBody {
  addresses: string[];
  driverCount: number;
  depotAddress?: string;
}

function validateBody(body: unknown): body is OptimizeRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.addresses)) return false;
  if (obj.addresses.length === 0) return false;
  if (obj.addresses.some((a: unknown) => typeof a !== "string")) return false;
  if (typeof obj.driverCount !== "number" || obj.driverCount < 1) return false;
  if (obj.depotAddress !== undefined && typeof obj.depotAddress !== "string") return false;
  return true;
}

// Singapore bounding box for realistic mock coordinates
const SG_LAT_MIN = 1.22, SG_LAT_MAX = 1.46;
const SG_LNG_MIN = 103.62, SG_LNG_MAX = 104.00;

/** Deterministic pseudo-random float in [min, max] seeded by index */
function mockCoord(min: number, max: number, seed: number): number {
  const x = ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
  return min + x * (max - min);
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function buildHaversineMatrix(stops: DeliveryStop[]): DistanceMatrix {
  const matrix: DistanceMatrix = {};
  for (const from of stops) {
    matrix[from.id] = {};
    for (const to of stops) {
      if (from.id === to.id) {
        matrix[from.id][to.id] = { distanceMeters: 0, durationSeconds: 0 };
      } else if (from.coordinates && to.coordinates) {
        const dist = haversineMeters(from.coordinates, to.coordinates);
        matrix[from.id][to.id] = {
          distanceMeters: dist,
          // ~30 km/h average urban speed
          durationSeconds: Math.round((dist / 1000) * 120),
        };
      } else {
        matrix[from.id][to.id] = { distanceMeters: 50000, durationSeconds: 3600 };
      }
    }
  }
  return matrix;
}

function buildMatrixFromOsrm(
  stops: DeliveryStop[],
  result: OsrmTableResult,
): DistanceMatrix {
  const matrix: DistanceMatrix = {};
  stops.forEach((from, i) => {
    matrix[from.id] = {};
    stops.forEach((to, j) => {
      matrix[from.id][to.id] = {
        distanceMeters: Math.round(result.distances[i][j]),
        durationSeconds: Math.round(result.durations[i][j]),
      };
    });
  });
  return matrix;
}

/**
 * Attempts OSRM for stops that have coordinates.
 * Returns null when OSRM is unavailable or the stop count exceeds the public server limit.
 */
async function tryBuildOsrmMatrix(stops: DeliveryStop[]): Promise<DistanceMatrix | null> {
  const stopsWithCoords = stops.filter((s) => s.coordinates != null);
  if (stopsWithCoords.length === 0 || stopsWithCoords.length > MAX_OSRM_STOPS) {
    return null;
  }

  const osrmResult = await getOsrmMatrix(
    stopsWithCoords.map((s) => s.coordinates!),
    3000,
  );

  if (!osrmResult) return null;

  // Build a full matrix covering all stops.
  // Stops without coordinates fall back to a large penalty distance.
  const stopsWithCoordsSet = new Set(stopsWithCoords.map((s) => s.id));
  const indexMap = new Map(stopsWithCoords.map((s, i) => [s.id, i]));

  const matrix: DistanceMatrix = {};
  for (const from of stops) {
    matrix[from.id] = {};
    for (const to of stops) {
      const fi = indexMap.get(from.id);
      const ti = indexMap.get(to.id);
      if (fi !== undefined && ti !== undefined) {
        matrix[from.id][to.id] = {
          distanceMeters: Math.round(osrmResult.distances[fi][ti]),
          durationSeconds: Math.round(osrmResult.durations[fi][ti]),
        };
      } else if (from.id === to.id) {
        matrix[from.id][to.id] = { distanceMeters: 0, durationSeconds: 0 };
      } else {
        matrix[from.id][to.id] = { distanceMeters: 50000, durationSeconds: 3600 };
      }
    }
  }
  return matrix;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!validateBody(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid request body. Required: { addresses: string[], driverCount: number, depotAddress?: string }",
        },
        { status: 400 },
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    // --- Mock path (no Google Maps API key) ---
    if (!apiKey) {
      const stops: DeliveryStop[] = body.addresses.map((address, i) => ({
        id: uuidv4(),
        address,
        label: `Stop ${i + 1}`,
        coordinates: {
          lat: mockCoord(SG_LAT_MIN, SG_LAT_MAX, i * 2),
          lng: mockCoord(SG_LNG_MIN, SG_LNG_MAX, i * 2 + 1),
        },
      }));

      // Attempt real road routing via OSRM even in mock mode —
      // the mock coordinates are valid SG locations.
      let matrix = await tryBuildOsrmMatrix(stops);
      let osrm = matrix !== null;

      if (!matrix) {
        matrix = buildHaversineMatrix(stops);
      }

      const optimizer = new RouteOptimizer();
      const planner = new MultiDriverPlanner(optimizer);
      const plan = planner.plan(stops, matrix, {
        driverCount: body.driverCount,
        depotAddress: body.depotAddress,
      });

      return NextResponse.json({
        mock: true,
        osrm,
        message:
          "GOOGLE_MAPS_API_KEY is not set. Returning mock data for demo. Set the env var for real geocoding.",
        plan,
      });
    }

    // --- Real path (Google Maps API key present) ---
    const allAddresses = body.depotAddress
      ? [body.depotAddress, ...body.addresses]
      : body.addresses;

    const allStops: DeliveryStop[] = allAddresses.map((address, i) => ({
      id: i === 0 && body.depotAddress ? "__depot__" : uuidv4(),
      address,
      label: i === 0 && body.depotAddress ? "Depot" : `Stop ${i}`,
    }));

    // Geocode each stop individually — fall back to mock SG coords on failure
    // so clustering and the map still work even if Geocoding API is unavailable.
    const mapsClient = new MapsClient(apiKey);
    const geocoder = new Geocoder(mapsClient);
    let geocodeErrors = 0;
    let geocodeErrorMsg: string | null = null;

    const geocodedStops = await Promise.all(
      allStops.map(async (stop, i) => {
        try {
          const coords = await geocoder.resolve(stop.address);
          return { ...stop, coordinates: coords };
        } catch (err) {
          geocodeErrors++;
          geocodeErrorMsg = err instanceof Error ? err.message : "Geocoding failed";
          // Fallback: deterministic SG coordinates so routing is still geographic
          return {
            ...stop,
            coordinates: {
              lat: mockCoord(SG_LAT_MIN, SG_LAT_MAX, i * 2),
              lng: mockCoord(SG_LNG_MIN, SG_LNG_MAX, i * 2 + 1),
            },
          };
        }
      }),
    );

    // Try OSRM first; fall back to haversine if unavailable or > 100 stops.
    let matrix = await tryBuildOsrmMatrix(geocodedStops);
    let osrm = matrix !== null;

    if (!matrix) {
      matrix = buildHaversineMatrix(geocodedStops);
    }

    const optimizer = new RouteOptimizer();
    const multiPlanner = new MultiDriverPlanner(optimizer);
    const plan = multiPlanner.plan(geocodedStops, matrix, {
      driverCount: body.driverCount,
      depotAddress: body.depotAddress,
    });

    return NextResponse.json({
      mock: false,
      osrm,
      geocodeErrors: geocodeErrors > 0 ? `${geocodeErrors}/${allStops.length} stops failed: ${geocodeErrorMsg}` : null,
      plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
