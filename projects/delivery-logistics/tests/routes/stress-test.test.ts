import { DeliveryStop } from '../../src/maps/types';
import { DistanceMatrix } from '../../src/routes/optimizer';
import { MultiDriverPlanner } from '../../src/routes/multi-driver';
import { buildGoogleMapsUrls } from '../../src/lib/maps-url';

// --- Singapore area definitions for realistic stop generation ---

const SG_AREAS: { name: string; latCenter: number; lngCenter: number }[] = [
  { name: 'Jurong', latCenter: 1.3400, lngCenter: 103.7250 },
  { name: 'Clementi', latCenter: 1.3150, lngCenter: 103.7650 },
  { name: 'Bukit Batok', latCenter: 1.3500, lngCenter: 103.7500 },
  { name: 'Queenstown', latCenter: 1.2950, lngCenter: 103.8020 },
  { name: 'Toa Payoh', latCenter: 1.3343, lngCenter: 103.8563 },
  { name: 'Bishan', latCenter: 1.3526, lngCenter: 103.8352 },
  { name: 'Ang Mo Kio', latCenter: 1.3691, lngCenter: 103.8454 },
  { name: 'Yishun', latCenter: 1.4295, lngCenter: 103.8350 },
  { name: 'Woodlands', latCenter: 1.4382, lngCenter: 103.7891 },
  { name: 'Sembawang', latCenter: 1.4491, lngCenter: 103.8185 },
  { name: 'Tampines', latCenter: 1.3496, lngCenter: 103.9568 },
  { name: 'Bedok', latCenter: 1.3236, lngCenter: 103.9273 },
  { name: 'Pasir Ris', latCenter: 1.3721, lngCenter: 103.9494 },
  { name: 'Punggol', latCenter: 1.4041, lngCenter: 103.9025 },
  { name: 'Sengkang', latCenter: 1.3910, lngCenter: 103.8953 },
  { name: 'Hougang', latCenter: 1.3612, lngCenter: 103.8863 },
  { name: 'Serangoon', latCenter: 1.3500, lngCenter: 103.8718 },
  { name: 'Geylang', latCenter: 1.3180, lngCenter: 103.8890 },
  { name: 'Marine Parade', latCenter: 1.3020, lngCenter: 103.9050 },
  { name: 'Bukit Timah', latCenter: 1.3400, lngCenter: 103.7760 },
];

/**
 * Generates N random Singapore delivery stops with realistic coordinates.
 * Each stop is assigned a random area, then its coordinates are jittered
 * slightly around the area center.
 */
function generateRandomStops(count: number): DeliveryStop[] {
  const stops: DeliveryStop[] = [];
  for (let i = 0; i < count; i++) {
    const area = SG_AREAS[i % SG_AREAS.length];
    // Jitter by up to ~500m in each direction
    const latJitter = (seededRandom(i * 7 + 1) - 0.5) * 0.009;
    const lngJitter = (seededRandom(i * 13 + 3) - 0.5) * 0.009;
    const lat = clamp(area.latCenter + latJitter, 1.25, 1.47);
    const lng = clamp(area.lngCenter + lngJitter, 103.60, 104.05);

    stops.push({
      id: `stop-${i + 1}`,
      address: `${i + 1} ${area.name} Street ${Math.floor(i / 20) + 1}, Singapore`,
      label: `${area.name} #${i + 1}`,
      coordinates: { lat, lng },
    });
  }
  return stops;
}

/** Deterministic pseudo-random number in [0, 1) based on seed. */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Builds a mock distance matrix using haversine for realistic distances.
 */
function buildHaversineMatrix(stops: DeliveryStop[]): DistanceMatrix {
  const matrix: DistanceMatrix = {};
  for (const from of stops) {
    matrix[from.id] = {};
    for (const to of stops) {
      if (from.id === to.id) {
        matrix[from.id][to.id] = { distanceMeters: 0, durationSeconds: 0 };
      } else {
        const dist = haversineMeters(from, to);
        matrix[from.id][to.id] = {
          distanceMeters: Math.round(dist),
          durationSeconds: Math.round(dist / 10),
        };
      }
    }
  }
  return matrix;
}

function haversineMeters(a: DeliveryStop, b: DeliveryStop): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad((b.coordinates?.lat ?? 0) - (a.coordinates?.lat ?? 0));
  const dLng = toRad((b.coordinates?.lng ?? 0) - (a.coordinates?.lng ?? 0));
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.coordinates?.lat ?? 0)) *
      Math.cos(toRad(b.coordinates?.lat ?? 0)) *
      sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function maxIntraClusterDistance(stops: DeliveryStop[]): number {
  let maxDist = 0;
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const d = haversineMeters(stops[i], stops[j]);
      if (d > maxDist) maxDist = d;
    }
  }
  return maxDist;
}

describe('Stress test: 150 random Singapore stops', () => {
  const STOP_COUNT = 150;
  const stops = generateRandomStops(STOP_COUNT);
  let planner: MultiDriverPlanner;

  beforeAll(() => {
    planner = new MultiDriverPlanner();
  });

  describe('3-driver split', () => {
    let plan: ReturnType<MultiDriverPlanner['plan']>;
    let matrix: DistanceMatrix;

    beforeAll(() => {
      matrix = buildHaversineMatrix(stops);
      plan = planner.plan(stops, matrix, { driverCount: 3 });
    });

    it('should assign all 150 stops with ~50 per driver', () => {
      expect(plan.totalStops).toBe(STOP_COUNT);
      expect(plan.totalDrivers).toBe(3);

      const totalAssigned = plan.routes.reduce((sum, r) => sum + r.stops.length, 0);
      expect(totalAssigned).toBe(STOP_COUNT);

      // Each driver should get roughly 50 stops (allow 20-80 range for clustering)
      for (const route of plan.routes) {
        expect(route.stops.length).toBeGreaterThanOrEqual(20);
        expect(route.stops.length).toBeLessThanOrEqual(80);
      }
    });

    it('should not lose or duplicate any stop', () => {
      const allIds = plan.routes.flatMap((r) => r.stops.map((s) => s.id));
      expect(allIds.length).toBe(STOP_COUNT);
      const unique = new Set(allIds);
      expect(unique.size).toBe(STOP_COUNT);

      // Every original stop ID is present
      for (const stop of stops) {
        expect(unique.has(stop.id)).toBe(true);
      }
    });

    it('should produce geographically coherent clusters (max diameter < 20km)', () => {
      for (let i = 0; i < plan.routes.length; i++) {
        const route = plan.routes[i];
        if (route.stops.length <= 1) continue;
        const diameter = maxIntraClusterDistance(route.stops);
        // Each cluster should have a diameter under 20km
        // Singapore's full diameter is ~42km, so good clusters should be well under that
        expect(diameter).toBeLessThan(20_000);
      }
    });

    it('should produce Google Maps URLs that split correctly for >25 stops', () => {
      for (const route of plan.routes) {
        if (route.stops.length === 0) continue;
        const addresses = route.stops.map((s) => s.address);
        const urls = buildGoogleMapsUrls(addresses);

        if (addresses.length <= 25) {
          expect(urls.length).toBe(1);
        } else {
          // Drivers with ~50 stops should need multiple URLs
          expect(urls.length).toBeGreaterThanOrEqual(2);
        }

        // Each URL should be a valid Google Maps URL
        for (const url of urls) {
          expect(url).toContain('google.com/maps');
        }
      }
    });
  });

  describe('5-driver split', () => {
    let plan: ReturnType<MultiDriverPlanner['plan']>;
    let matrix: DistanceMatrix;

    beforeAll(() => {
      matrix = buildHaversineMatrix(stops);
      plan = planner.plan(stops, matrix, { driverCount: 5 });
    });

    it('should assign all 150 stops with ~30 per driver', () => {
      expect(plan.totalStops).toBe(STOP_COUNT);
      expect(plan.totalDrivers).toBe(5);

      const totalAssigned = plan.routes.reduce((sum, r) => sum + r.stops.length, 0);
      expect(totalAssigned).toBe(STOP_COUNT);

      // Each driver should get roughly 30 stops (allow 10-60 range for clustering)
      for (const route of plan.routes) {
        expect(route.stops.length).toBeGreaterThanOrEqual(10);
        expect(route.stops.length).toBeLessThanOrEqual(60);
      }
    });

    it('should not lose or duplicate any stop', () => {
      const allIds = plan.routes.flatMap((r) => r.stops.map((s) => s.id));
      expect(allIds.length).toBe(STOP_COUNT);
      expect(new Set(allIds).size).toBe(STOP_COUNT);
    });

    it('should produce geographically coherent clusters (max diameter < 20km)', () => {
      for (const route of plan.routes) {
        if (route.stops.length <= 1) continue;
        const diameter = maxIntraClusterDistance(route.stops);
        expect(diameter).toBeLessThan(20_000);
      }
    });
  });

  describe('Google Maps URL splitting', () => {
    it('should produce 1 URL for 20 addresses', () => {
      const addresses = stops.slice(0, 20).map((s) => s.address);
      const urls = buildGoogleMapsUrls(addresses);
      expect(urls.length).toBe(1);
    });

    it('should produce multiple URLs for 50 addresses', () => {
      const addresses = stops.slice(0, 50).map((s) => s.address);
      const urls = buildGoogleMapsUrls(addresses);
      // 50 addresses with 25-point chunks (overlap 1): 0-24, 24-48, 48-49 = 3 URLs
      expect(urls.length).toBeGreaterThanOrEqual(2);

      // Each URL should be valid
      for (const url of urls) {
        expect(url).toContain('google.com/maps');
        expect(url).toContain('travelmode=driving');
      }
    });

    it('should produce correct number of URLs for 150 addresses', () => {
      const addresses = stops.map((s) => s.address);
      const urls = buildGoogleMapsUrls(addresses);
      // 150 addresses: chunk 1=25, chunk 2=25 (starting from 25th), ...
      // With overlap: 25, 49, 73, 97, 121, 145, 150 -> ~7 URLs
      expect(urls.length).toBeGreaterThanOrEqual(6);

      for (const url of urls) {
        expect(url).toContain('google.com/maps');
      }
    });

    it('should handle edge case of exactly 25 addresses in 1 URL', () => {
      const addresses = stops.slice(0, 25).map((s) => s.address);
      const urls = buildGoogleMapsUrls(addresses);
      expect(urls.length).toBe(1);
    });

    it('should split at 26 addresses into 2 URLs', () => {
      const addresses = stops.slice(0, 26).map((s) => s.address);
      const urls = buildGoogleMapsUrls(addresses);
      expect(urls.length).toBe(2);
    });
  });
});
