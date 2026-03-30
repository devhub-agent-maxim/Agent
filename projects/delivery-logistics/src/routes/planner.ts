import { MapsClient } from '../maps/client';
import { Geocoder } from '../maps/geocoder';
import { DeliveryStop, OptimizedRoute } from '../maps/types';
import { RouteOptimizer, DistanceMatrix } from './optimizer';

export class RoutePlanner {
  private readonly client: MapsClient;
  private readonly geocoder: Geocoder;
  private readonly optimizer: RouteOptimizer;

  constructor(apiKey: string) {
    this.client = new MapsClient(apiKey);
    this.geocoder = new Geocoder(this.client);
    this.optimizer = new RouteOptimizer();
  }

  async plan(stops: DeliveryStop[]): Promise<OptimizedRoute> {
    if (stops.length === 0) throw new Error('No delivery stops provided');
    if (stops.length === 1) {
      return { stops, segments: [], totalDistanceMeters: 0, totalDurationSeconds: 0 };
    }

    // Geocode all addresses that don't have coordinates
    const stopsWithCoords = await this.resolveCoordinates(stops);

    // Build distance matrix using Distance Matrix API
    const matrix = await this.buildDistanceMatrix(stopsWithCoords);

    // Optimise order
    const orderedStops = this.optimizer.optimize(stopsWithCoords, matrix);
    const segments = this.optimizer.buildSegments(orderedStops, matrix);

    return {
      stops: orderedStops,
      segments,
      totalDistanceMeters: this.optimizer.totalDistance(segments),
      totalDurationSeconds: this.optimizer.totalDuration(segments),
    };
  }

  private async resolveCoordinates(stops: DeliveryStop[]): Promise<DeliveryStop[]> {
    const needsGeocoding = stops.filter(s => !s.coordinates);
    const coordMap = await this.geocoder.resolveMany(needsGeocoding.map(s => s.address));

    return stops.map(stop => ({
      ...stop,
      coordinates: stop.coordinates ?? coordMap.get(stop.address),
    }));
  }

  private async buildDistanceMatrix(stops: DeliveryStop[]): Promise<DistanceMatrix> {
    const addresses = stops.map(s => s.address);
    const raw = await this.client.getDistanceMatrix(addresses, addresses);

    const matrix: DistanceMatrix = {};
    stops.forEach((from, i) => {
      matrix[from.id] = {};
      stops.forEach((to, j) => {
        const el = raw.rows[i]?.elements[j];
        matrix[from.id][to.id] = {
          distanceMeters: el?.distance?.value ?? 0,
          durationSeconds: el?.duration?.value ?? 0,
        };
      });
    });

    return matrix;
  }
}
