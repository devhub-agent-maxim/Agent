import { Coordinates, DeliveryStop, RouteSegment } from '../maps/types';
import { RouteOptimizer, DistanceMatrix } from './optimizer';

export interface DriverRoute {
  driverId: string;
  driverName: string;
  stops: DeliveryStop[];
  segments: RouteSegment[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

export interface MultiDriverPlan {
  routes: DriverRoute[];
  totalStops: number;
  totalDrivers: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

export interface MultiDriverOptions {
  driverCount: number;
  depotAddress?: string;
  depotCoordinates?: Coordinates;
  maxIterations?: number;
}

/**
 * Splits deliveries across multiple drivers using geographic clustering,
 * then optimizes each driver's route independently.
 */
export class MultiDriverPlanner {
  private readonly optimizer: RouteOptimizer;

  constructor(optimizer?: RouteOptimizer) {
    this.optimizer = optimizer ?? new RouteOptimizer();
  }

  /**
   * Plans routes for multiple drivers given a set of delivery stops and a distance matrix.
   *
   * @param stops - All delivery stops to distribute
   * @param matrix - Precomputed distance matrix for all stops (and depot if applicable)
   * @param options - Driver count, optional depot, and clustering parameters
   * @returns A MultiDriverPlan with optimized routes per driver
   */
  plan(
    stops: DeliveryStop[],
    matrix: DistanceMatrix,
    options: MultiDriverOptions,
  ): MultiDriverPlan {
    const { driverCount } = options;

    if (driverCount < 1) {
      throw new Error('driverCount must be at least 1');
    }

    if (stops.length === 0) {
      return this.buildEmptyPlan(driverCount);
    }

    const effectiveDriverCount = Math.min(driverCount, stops.length);
    const clusters = this.clusterStops(stops, effectiveDriverCount, options);
    const routes = this.buildDriverRoutes(clusters, matrix, options);

    // Fill remaining drivers with empty routes if fewer stops than drivers
    for (let i = effectiveDriverCount; i < driverCount; i++) {
      routes.push(this.createEmptyDriverRoute(i));
    }

    return {
      routes,
      totalStops: stops.length,
      totalDrivers: driverCount,
      totalDistanceMeters: routes.reduce((sum, r) => sum + r.totalDistanceMeters, 0),
      totalDurationSeconds: routes.reduce((sum, r) => sum + r.totalDurationSeconds, 0),
    };
  }

  /**
   * Clusters stops into groups using k-means on lat/lng coordinates.
   * Falls back to even splitting when coordinates are missing.
   */
  private clusterStops(
    stops: DeliveryStop[],
    k: number,
    options: MultiDriverOptions,
  ): DeliveryStop[][] {
    if (k === 1) return [stops];

    const stopsWithCoords = stops.filter((s) => s.coordinates != null);
    const stopsWithoutCoords = stops.filter((s) => s.coordinates == null);

    // If not enough stops have coordinates, fall back to even splitting
    if (stopsWithCoords.length < k) {
      return this.splitEvenly(stops, k);
    }

    // Run k-means on the stops that have coordinates
    const maxIterations = options.maxIterations ?? 20;
    const clusters = this.kMeansClustering(stopsWithCoords, k, maxIterations);

    // Distribute stops without coordinates evenly across clusters
    if (stopsWithoutCoords.length > 0) {
      this.distributeRemaining(stopsWithoutCoords, clusters);
    }

    return clusters;
  }

  /**
   * Simple k-means clustering on geographic coordinates.
   * Initializes centroids by picking evenly spaced stops sorted by longitude.
   */
  private kMeansClustering(
    stops: DeliveryStop[],
    k: number,
    maxIterations: number,
  ): DeliveryStop[][] {
    // Initialize centroids using evenly spaced picks from longitude-sorted stops
    const centroids = this.initializeCentroids(stops, k);
    let assignments = new Array<number>(stops.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assignment step: assign each stop to nearest centroid
      const newAssignments = stops.map((stop) => {
        const coords = stop.coordinates!;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const dist = this.haversineDistance(coords, centroids[c]);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = c;
          }
        }
        return bestIdx;
      });

      // Check for convergence
      const converged = newAssignments.every((a, i) => a === assignments[i]);
      assignments = newAssignments;

      if (converged) break;

      // Update step: recalculate centroids
      for (let c = 0; c < k; c++) {
        const members = stops.filter((_, i) => assignments[i] === c);
        if (members.length > 0) {
          centroids[c] = {
            lat: members.reduce((sum, s) => sum + s.coordinates!.lat, 0) / members.length,
            lng: members.reduce((sum, s) => sum + s.coordinates!.lng, 0) / members.length,
          };
        }
      }
    }

    // Build cluster arrays
    const clusters: DeliveryStop[][] = Array.from({ length: k }, () => []);
    stops.forEach((stop, i) => {
      clusters[assignments[i]].push(stop);
    });

    // Remove empty clusters and rebalance if needed
    return clusters.filter((c) => c.length > 0);
  }

  /**
   * Initialize k centroids by sorting stops by longitude and picking evenly spaced ones.
   */
  private initializeCentroids(stops: DeliveryStop[], k: number): Coordinates[] {
    const sorted = [...stops].sort(
      (a, b) => a.coordinates!.lng - b.coordinates!.lng,
    );
    const step = sorted.length / k;
    return Array.from({ length: k }, (_, i) => {
      const idx = Math.min(Math.floor(i * step), sorted.length - 1);
      return { ...sorted[idx].coordinates! };
    });
  }

  /**
   * Haversine distance between two coordinate points in meters.
   */
  private haversineDistance(a: Coordinates, b: Coordinates): number {
    const R = 6_371_000; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);

    const h =
      sinLat * sinLat +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;

    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /**
   * Distributes remaining stops (those without coordinates) across clusters
   * by assigning to the smallest cluster first (round-robin by size).
   */
  private distributeRemaining(
    stops: DeliveryStop[],
    clusters: DeliveryStop[][],
  ): void {
    for (const stop of stops) {
      // Find the cluster with the fewest stops
      let minIdx = 0;
      let minSize = clusters[0].length;
      for (let i = 1; i < clusters.length; i++) {
        if (clusters[i].length < minSize) {
          minSize = clusters[i].length;
          minIdx = i;
        }
      }
      clusters[minIdx].push(stop);
    }
  }

  /**
   * Fallback: splits stops into k roughly equal groups preserving original order.
   */
  private splitEvenly(stops: DeliveryStop[], k: number): DeliveryStop[][] {
    const clusters: DeliveryStop[][] = Array.from({ length: k }, () => []);
    stops.forEach((stop, i) => {
      clusters[i % k].push(stop);
    });
    return clusters;
  }

  /**
   * For each cluster, build an optimized driver route.
   * If a depot is specified, it is prepended so each route starts from depot.
   */
  private buildDriverRoutes(
    clusters: DeliveryStop[][],
    matrix: DistanceMatrix,
    options: MultiDriverOptions,
  ): DriverRoute[] {
    return clusters.map((clusterStops, idx) => {
      const driverId = `driver-${idx + 1}`;
      const driverName = `Driver ${idx + 1}`;

      if (clusterStops.length === 0) {
        return this.createEmptyDriverRoute(idx);
      }

      // If depot is provided and exists in the matrix, prepend it
      let stopsForOptimization = clusterStops;
      if (options.depotAddress) {
        const depotStop: DeliveryStop = {
          id: '__depot__',
          address: options.depotAddress,
          label: 'Depot',
          coordinates: options.depotCoordinates,
        };
        // Only prepend depot if it exists in the matrix
        if (matrix[depotStop.id]) {
          stopsForOptimization = [depotStop, ...clusterStops];
        }
      }

      const orderedStops = this.optimizer.optimize(stopsForOptimization, matrix);
      const segments = this.optimizer.buildSegments(orderedStops, matrix);

      return {
        driverId,
        driverName,
        stops: orderedStops,
        segments,
        totalDistanceMeters: this.optimizer.totalDistance(segments),
        totalDurationSeconds: this.optimizer.totalDuration(segments),
      };
    });
  }

  private buildEmptyPlan(driverCount: number): MultiDriverPlan {
    const routes: DriverRoute[] = Array.from({ length: driverCount }, (_, i) =>
      this.createEmptyDriverRoute(i),
    );
    return {
      routes,
      totalStops: 0,
      totalDrivers: driverCount,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
    };
  }

  private createEmptyDriverRoute(index: number): DriverRoute {
    return {
      driverId: `driver-${index + 1}`,
      driverName: `Driver ${index + 1}`,
      stops: [],
      segments: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
    };
  }
}
