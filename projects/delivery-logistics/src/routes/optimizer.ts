import { DeliveryStop, RouteSegment } from '../maps/types';

export interface DistanceMatrix {
  [fromId: string]: {
    [toId: string]: { distanceMeters: number; durationSeconds: number };
  };
}

export class RouteOptimizer {
  /**
   * Nearest-neighbour greedy TSP heuristic.
   * Starting from the first stop, always visit the closest unvisited stop next.
   * Returns an ordered array of stops (starting point preserved as index 0).
   */
  optimize(stops: DeliveryStop[], matrix: DistanceMatrix): DeliveryStop[] {
    if (stops.length <= 1) return stops;

    const visited = new Set<string>();
    const ordered: DeliveryStop[] = [];

    // Start from first stop
    let current = stops[0];
    ordered.push(current);
    visited.add(current.id);

    while (ordered.length < stops.length) {
      const next = this.findNearest(current, stops, visited, matrix);
      if (!next) break;
      ordered.push(next);
      visited.add(next.id);
      current = next;
    }

    return ordered;
  }

  private findNearest(
    from: DeliveryStop,
    candidates: DeliveryStop[],
    visited: Set<string>,
    matrix: DistanceMatrix
  ): DeliveryStop | null {
    let best: DeliveryStop | null = null;
    let bestDist = Infinity;

    for (const stop of candidates) {
      if (visited.has(stop.id)) continue;
      const dist = matrix[from.id]?.[stop.id]?.distanceMeters ?? Infinity;
      if (dist < bestDist) {
        bestDist = dist;
        best = stop;
      }
    }

    return best;
  }

  buildSegments(orderedStops: DeliveryStop[], matrix: DistanceMatrix): RouteSegment[] {
    const segments: RouteSegment[] = [];
    for (let i = 0; i < orderedStops.length - 1; i++) {
      const from = orderedStops[i];
      const to = orderedStops[i + 1];
      const data = matrix[from.id]?.[to.id] ?? { distanceMeters: 0, durationSeconds: 0 };
      segments.push({ from, to, ...data });
    }
    return segments;
  }

  totalDistance(segments: RouteSegment[]): number {
    return segments.reduce((sum, s) => sum + s.distanceMeters, 0);
  }

  totalDuration(segments: RouteSegment[]): number {
    return segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  }
}
