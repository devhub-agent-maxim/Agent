import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { RoutePlanner } from "@/routes/planner";
import { MultiDriverPlanner, DriverRoute, MultiDriverPlan } from "@/routes/multi-driver";
import { DeliveryStop } from "@/maps/types";
import { RouteOptimizer, DistanceMatrix } from "@/routes/optimizer";

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

function buildMockPlan(addresses: string[], driverCount: number): MultiDriverPlan {
  const stops: DeliveryStop[] = addresses.map((address, i) => ({
    id: uuidv4(),
    address,
    label: `Stop ${i + 1}`,
    coordinates: {
      lat: 1.3521 + (i * 0.008),
      lng: 103.8198 + (i * 0.005),
    },
  }));

  const count = Math.min(driverCount, stops.length);
  const chunkSize = Math.ceil(stops.length / count);
  const routes: DriverRoute[] = [];

  for (let d = 0; d < count; d++) {
    const chunk = stops.slice(d * chunkSize, (d + 1) * chunkSize);
    if (chunk.length === 0) continue;

    const segments = [];
    for (let i = 0; i < chunk.length - 1; i++) {
      segments.push({
        from: chunk[i],
        to: chunk[i + 1],
        distanceMeters: 1200 + Math.floor(Math.random() * 2800),
        durationSeconds: 360 + Math.floor(Math.random() * 540),
      });
    }

    routes.push({
      driverId: `driver-${d}`,
      driverName: `Driver ${d + 1}`,
      stops: chunk,
      segments,
      totalDistanceMeters: segments.reduce((s, seg) => s + seg.distanceMeters, 0),
      totalDurationSeconds: segments.reduce((s, seg) => s + seg.durationSeconds, 0),
    });
  }

  return {
    routes,
    totalStops: stops.length,
    totalDrivers: routes.length,
    totalDistanceMeters: routes.reduce((s, r) => s + r.totalDistanceMeters, 0),
    totalDurationSeconds: routes.reduce((s, r) => s + r.totalDurationSeconds, 0),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!validateBody(body)) {
      return NextResponse.json(
        { error: "Invalid request body. Required: { addresses: string[], driverCount: number, depotAddress?: string }" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      const plan = buildMockPlan(body.addresses, body.driverCount);
      return NextResponse.json({
        mock: true,
        message: "GOOGLE_MAPS_API_KEY is not set. Returning mock data for demo. Set the env var for real route optimization.",
        plan,
      });
    }

    // Real path: geocode all stops, build distance matrix, run multi-driver optimizer
    const deliveryStops: DeliveryStop[] = body.addresses.map((address, i) => ({
      id: uuidv4(),
      address,
      label: `Stop ${i + 1}`,
    }));

    const planner = new RoutePlanner(apiKey);

    // Geocode all stops and build a full distance matrix
    const allAddresses = body.depotAddress
      ? [body.depotAddress, ...body.addresses]
      : body.addresses;

    const allStops: DeliveryStop[] = allAddresses.map((address, i) => ({
      id: i === 0 && body.depotAddress ? "__depot__" : uuidv4(),
      address,
      label: i === 0 && body.depotAddress ? "Depot" : `Stop ${i}`,
    }));

    // Use RoutePlanner internals via the multi-driver planner
    // First geocode coordinates for all stops
    const geocodedStops = await Promise.all(
      allStops.map(async (stop) => {
        try {
          const result = await (planner as any).geocoder?.resolve(stop.address);
          return result ? { ...stop, coordinates: result } : stop;
        } catch {
          return stop;
        }
      })
    );

    // Build distance matrix for all stops
    const optimizerInstance = new RouteOptimizer();
    const matrix: DistanceMatrix = {};

    // Build a simple distance matrix from geocoded coordinates (haversine fallback)
    for (const from of geocodedStops) {
      matrix[from.id] = {};
      for (const to of geocodedStops) {
        if (from.id === to.id) {
          matrix[from.id][to.id] = { distanceMeters: 0, durationSeconds: 0 };
        } else if (from.coordinates && to.coordinates) {
          const dist = haversineMeters(from.coordinates, to.coordinates);
          matrix[from.id][to.id] = {
            distanceMeters: dist,
            durationSeconds: Math.round((dist / 1000) * 120), // ~30km/h avg
          };
        } else {
          matrix[from.id][to.id] = { distanceMeters: 50000, durationSeconds: 3600 };
        }
      }
    }

    const multiPlanner = new MultiDriverPlanner(optimizerInstance);
    const plan = multiPlanner.plan(geocodedStops, matrix, {
      driverCount: body.driverCount,
      depotAddress: body.depotAddress,
    });

    return NextResponse.json({ mock: false, plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x = sinDLat * sinDLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
