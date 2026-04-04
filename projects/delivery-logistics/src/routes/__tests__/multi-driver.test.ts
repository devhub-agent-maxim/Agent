import { DeliveryStop } from '../../maps/types';
import { DistanceMatrix } from '../optimizer';
import { MultiDriverPlanner, MultiDriverPlan } from '../multi-driver';

// --- Singapore test stops ---

const SG_STOPS: DeliveryStop[] = [
  { id: 'jurong-east', address: 'Jurong East, Singapore', label: 'Jurong East', coordinates: { lat: 1.3329, lng: 103.7436 } },
  { id: 'tampines', address: 'Tampines, Singapore', label: 'Tampines', coordinates: { lat: 1.3496, lng: 103.9568 } },
  { id: 'woodlands', address: 'Woodlands, Singapore', label: 'Woodlands', coordinates: { lat: 1.4382, lng: 103.7891 } },
  { id: 'clementi', address: 'Clementi, Singapore', label: 'Clementi', coordinates: { lat: 1.3162, lng: 103.7649 } },
  { id: 'bedok', address: 'Bedok, Singapore', label: 'Bedok', coordinates: { lat: 1.3236, lng: 103.9273 } },
  { id: 'ang-mo-kio', address: 'Ang Mo Kio, Singapore', label: 'Ang Mo Kio', coordinates: { lat: 1.3691, lng: 103.8454 } },
  { id: 'toa-payoh', address: 'Toa Payoh, Singapore', label: 'Toa Payoh', coordinates: { lat: 1.3343, lng: 103.8563 } },
  { id: 'bishan', address: 'Bishan, Singapore', label: 'Bishan', coordinates: { lat: 1.3526, lng: 103.8352 } },
  { id: 'punggol', address: 'Punggol, Singapore', label: 'Punggol', coordinates: { lat: 1.4041, lng: 103.9025 } },
  { id: 'pasir-ris', address: 'Pasir Ris, Singapore', label: 'Pasir Ris', coordinates: { lat: 1.3721, lng: 103.9494 } },
];

/**
 * Builds a simple mock distance matrix from an array of stops.
 * Uses Euclidean distance on lat/lng (scaled) as a proxy for real distances.
 */
function buildMockMatrix(stops: DeliveryStop[]): DistanceMatrix {
  const matrix: DistanceMatrix = {};
  for (const from of stops) {
    matrix[from.id] = {};
    for (const to of stops) {
      if (from.id === to.id) {
        matrix[from.id][to.id] = { distanceMeters: 0, durationSeconds: 0 };
      } else {
        const dist = euclideanMeters(from, to);
        matrix[from.id][to.id] = {
          distanceMeters: Math.round(dist),
          durationSeconds: Math.round(dist / 10), // ~36 km/h average
        };
      }
    }
  }
  return matrix;
}

function euclideanMeters(a: DeliveryStop, b: DeliveryStop): number {
  const latDiff = ((a.coordinates?.lat ?? 0) - (b.coordinates?.lat ?? 0)) * 111_320;
  const lngDiff =
    ((a.coordinates?.lng ?? 0) - (b.coordinates?.lng ?? 0)) *
    111_320 *
    Math.cos(((a.coordinates?.lat ?? 0) * Math.PI) / 180);
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

// Collect all assigned stop IDs from a plan
function allAssignedIds(plan: MultiDriverPlan): string[] {
  return plan.routes.flatMap((r) => r.stops.map((s) => s.id));
}

describe('MultiDriverPlanner', () => {
  let planner: MultiDriverPlanner;

  beforeEach(() => {
    planner = new MultiDriverPlanner();
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('should return empty routes for 0 stops', () => {
      const matrix: DistanceMatrix = {};
      const plan = planner.plan([], matrix, { driverCount: 3 });

      expect(plan.totalStops).toBe(0);
      expect(plan.totalDrivers).toBe(3);
      expect(plan.routes).toHaveLength(3);
      expect(plan.totalDistanceMeters).toBe(0);
      expect(plan.totalDurationSeconds).toBe(0);
      plan.routes.forEach((r) => {
        expect(r.stops).toHaveLength(0);
        expect(r.segments).toHaveLength(0);
      });
    });

    it('should handle 1 stop with 1 driver', () => {
      const stops = [SG_STOPS[0]];
      const matrix = buildMockMatrix(stops);
      const plan = planner.plan(stops, matrix, { driverCount: 1 });

      expect(plan.totalStops).toBe(1);
      expect(plan.totalDrivers).toBe(1);
      expect(plan.routes).toHaveLength(1);
      expect(plan.routes[0].stops).toHaveLength(1);
      expect(plan.routes[0].stops[0].id).toBe('jurong-east');
      expect(plan.routes[0].segments).toHaveLength(0);
    });

    it('should handle 1 stop with multiple drivers', () => {
      const stops = [SG_STOPS[0]];
      const matrix = buildMockMatrix(stops);
      const plan = planner.plan(stops, matrix, { driverCount: 3 });

      expect(plan.totalStops).toBe(1);
      expect(plan.totalDrivers).toBe(3);
      expect(plan.routes).toHaveLength(3);

      // Exactly one route should have the stop
      const routesWithStops = plan.routes.filter((r) => r.stops.length > 0);
      expect(routesWithStops).toHaveLength(1);
      expect(routesWithStops[0].stops[0].id).toBe('jurong-east');
    });

    it('should handle 2 stops with 2 drivers', () => {
      const stops = [SG_STOPS[0], SG_STOPS[1]];
      const matrix = buildMockMatrix(stops);
      const plan = planner.plan(stops, matrix, { driverCount: 2 });

      expect(plan.totalStops).toBe(2);
      expect(plan.totalDrivers).toBe(2);
      const ids = allAssignedIds(plan);
      expect(ids).toHaveLength(2);
      expect(ids).toContain('jurong-east');
      expect(ids).toContain('tampines');
    });

    it('should throw if driverCount is less than 1', () => {
      expect(() => planner.plan([], {}, { driverCount: 0 })).toThrow(
        'driverCount must be at least 1',
      );
    });
  });

  // --- More drivers than stops ---

  describe('more drivers than stops', () => {
    it('should assign each stop to a separate driver when possible', () => {
      const stops = SG_STOPS.slice(0, 3); // 3 stops
      const matrix = buildMockMatrix(stops);
      const plan = planner.plan(stops, matrix, { driverCount: 5 });

      expect(plan.totalStops).toBe(3);
      expect(plan.totalDrivers).toBe(5);
      expect(plan.routes).toHaveLength(5);

      // All 3 stops must be assigned
      const ids = allAssignedIds(plan);
      expect(ids).toHaveLength(3);
      stops.forEach((s) => expect(ids).toContain(s.id));

      // At least 2 routes should be empty
      const emptyRoutes = plan.routes.filter((r) => r.stops.length === 0);
      expect(emptyRoutes.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- Complete assignment guarantees ---

  describe('stop assignment integrity', () => {
    it('should assign all stops with no stop lost (10 stops, 3 drivers)', () => {
      const matrix = buildMockMatrix(SG_STOPS);
      const plan = planner.plan(SG_STOPS, matrix, { driverCount: 3 });

      const ids = allAssignedIds(plan);
      expect(ids).toHaveLength(10);
      SG_STOPS.forEach((s) => expect(ids).toContain(s.id));
    });

    it('should not assign any stop to multiple drivers', () => {
      const matrix = buildMockMatrix(SG_STOPS);
      const plan = planner.plan(SG_STOPS, matrix, { driverCount: 3 });

      const ids = allAssignedIds(plan);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  // --- Geographic clustering quality ---

  describe('geographic clustering', () => {
    it('should cluster nearby stops together (3 drivers, 10 SG stops)', () => {
      const matrix = buildMockMatrix(SG_STOPS);
      const plan = planner.plan(SG_STOPS, matrix, { driverCount: 3 });

      expect(plan.routes).toHaveLength(3);
      expect(plan.totalStops).toBe(10);

      // Each driver should have at least 1 stop
      plan.routes.forEach((r) => {
        expect(r.stops.length).toBeGreaterThanOrEqual(1);
      });

      // West cluster should contain Jurong East and Clementi together
      // (they are the two westernmost stops)
      const westIds = ['jurong-east', 'clementi'];
      const routeContainingWest = plan.routes.find((r) =>
        r.stops.some((s) => s.id === 'jurong-east'),
      );
      expect(routeContainingWest).toBeDefined();
      const westInSameRoute = westIds.every((id) =>
        routeContainingWest!.stops.some((s) => s.id === id),
      );
      expect(westInSameRoute).toBe(true);

      // East cluster should keep Tampines, Bedok, Pasir Ris together
      const eastIds = ['tampines', 'bedok', 'pasir-ris'];
      const routeContainingEast = plan.routes.find((r) =>
        r.stops.some((s) => s.id === 'tampines'),
      );
      expect(routeContainingEast).toBeDefined();
      const eastInSameRoute = eastIds.every((id) =>
        routeContainingEast!.stops.some((s) => s.id === id),
      );
      expect(eastInSameRoute).toBe(true);
    });

    it('should fall back to even splitting when stops lack coordinates', () => {
      const stopsNoCoords: DeliveryStop[] = SG_STOPS.map((s) => ({
        id: s.id,
        address: s.address,
        label: s.label,
        // no coordinates
      }));
      const matrix = buildMockMatrix(SG_STOPS); // matrix still works by id
      const plan = planner.plan(stopsNoCoords, matrix, { driverCount: 3 });

      expect(plan.totalStops).toBe(10);
      const ids = allAssignedIds(plan);
      expect(new Set(ids).size).toBe(10);

      // Each driver gets 3-4 stops in even split of 10
      plan.routes.forEach((r) => {
        expect(r.stops.length).toBeGreaterThanOrEqual(3);
        expect(r.stops.length).toBeLessThanOrEqual(4);
      });
    });
  });

  // --- Route optimization ---

  describe('route optimization', () => {
    it('should produce valid segments for each driver route', () => {
      const matrix = buildMockMatrix(SG_STOPS);
      const plan = planner.plan(SG_STOPS, matrix, { driverCount: 3 });

      plan.routes.forEach((route) => {
        if (route.stops.length <= 1) {
          expect(route.segments).toHaveLength(0);
          return;
        }
        // segments count = stops count - 1
        expect(route.segments).toHaveLength(route.stops.length - 1);

        // Each segment connects consecutive stops
        for (let i = 0; i < route.segments.length; i++) {
          expect(route.segments[i].from.id).toBe(route.stops[i].id);
          expect(route.segments[i].to.id).toBe(route.stops[i + 1].id);
        }
      });
    });

    it('should compute correct totals from segments', () => {
      const matrix = buildMockMatrix(SG_STOPS);
      const plan = planner.plan(SG_STOPS, matrix, { driverCount: 3 });

      plan.routes.forEach((route) => {
        const expectedDist = route.segments.reduce(
          (sum, s) => sum + s.distanceMeters,
          0,
        );
        const expectedDur = route.segments.reduce(
          (sum, s) => sum + s.durationSeconds,
          0,
        );
        expect(route.totalDistanceMeters).toBe(expectedDist);
        expect(route.totalDurationSeconds).toBe(expectedDur);
      });

      const totalDist = plan.routes.reduce(
        (sum, r) => sum + r.totalDistanceMeters,
        0,
      );
      const totalDur = plan.routes.reduce(
        (sum, r) => sum + r.totalDurationSeconds,
        0,
      );
      expect(plan.totalDistanceMeters).toBe(totalDist);
      expect(plan.totalDurationSeconds).toBe(totalDur);
    });
  });

  // --- Driver route metadata ---

  describe('driver metadata', () => {
    it('should assign sequential driver IDs and names', () => {
      const matrix = buildMockMatrix(SG_STOPS);
      const plan = planner.plan(SG_STOPS, matrix, { driverCount: 3 });

      expect(plan.routes[0].driverId).toBe('driver-1');
      expect(plan.routes[0].driverName).toBe('Driver 1');
      expect(plan.routes[1].driverId).toBe('driver-2');
      expect(plan.routes[1].driverName).toBe('Driver 2');
      expect(plan.routes[2].driverId).toBe('driver-3');
      expect(plan.routes[2].driverName).toBe('Driver 3');
    });
  });

  // --- Depot support ---

  describe('depot address', () => {
    it('should prepend depot to each route when depot is in the matrix', () => {
      const depot: DeliveryStop = {
        id: '__depot__',
        address: 'Changi Business Park, Singapore',
        label: 'Depot',
        coordinates: { lat: 1.3341, lng: 103.9627 },
      };
      const allStops = [depot, ...SG_STOPS];
      const matrix = buildMockMatrix(allStops);

      const plan = planner.plan(SG_STOPS, matrix, {
        driverCount: 3,
        depotAddress: depot.address,
        depotCoordinates: depot.coordinates,
      });

      // At least one route should start with the depot
      const routesStartingWithDepot = plan.routes.filter(
        (r) => r.stops.length > 0 && r.stops[0].id === '__depot__',
      );
      expect(routesStartingWithDepot.length).toBeGreaterThanOrEqual(1);
    });
  });
});
