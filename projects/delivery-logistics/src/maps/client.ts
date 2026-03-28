import axios, { AxiosInstance } from 'axios';
import { DirectionsResult, DistanceMatrixResult, GeocodeResult, Coordinates } from './types';

const MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

export class MapsClient {
  private readonly http: AxiosInstance;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Google Maps API key is required');
    this.apiKey = apiKey;
    this.http = axios.create({ baseURL: MAPS_BASE_URL });
  }

  async getDirections(origin: string, destination: string): Promise<DirectionsResult> {
    const response = await this.http.get('/directions/json', {
      params: {
        origin,
        destination,
        key: this.apiKey,
      },
    });

    const data = response.data;
    if (data.status !== 'OK') {
      throw new Error(`Directions API error: ${data.status} - ${data.error_message || ''}`);
    }

    const leg = data.routes[0].legs[0];
    return {
      distanceMeters: leg.distance.value,
      durationSeconds: leg.duration.value,
      polyline: data.routes[0].overview_polyline?.points,
    };
  }

  async getDistanceMatrix(origins: string[], destinations: string[]): Promise<DistanceMatrixResult> {
    const response = await this.http.get('/distancematrix/json', {
      params: {
        origins: origins.join('|'),
        destinations: destinations.join('|'),
        key: this.apiKey,
      },
    });

    const data = response.data;
    if (data.status !== 'OK') {
      throw new Error(`Distance Matrix API error: ${data.status} - ${data.error_message || ''}`);
    }

    return {
      origins: data.origin_addresses,
      destinations: data.destination_addresses,
      rows: data.rows,
    };
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const response = await this.http.get('/geocode/json', {
      params: {
        address,
        key: this.apiKey,
      },
    });

    const data = response.data;
    if (data.status !== 'OK') {
      throw new Error(`Geocoding API error: ${data.status} - ${data.error_message || ''}`);
    }

    const result = data.results[0];
    return {
      address,
      coordinates: result.geometry.location as Coordinates,
      formattedAddress: result.formatted_address,
    };
  }
}
