import { MapsClient } from './client';
import { Coordinates, GeocodeResult } from './types';

export class Geocoder {
  private readonly client: MapsClient;
  private readonly cache: Map<string, GeocodeResult>;

  constructor(client: MapsClient) {
    this.client = client;
    this.cache = new Map();
  }

  async resolve(address: string): Promise<Coordinates> {
    const normalised = address.trim().toLowerCase();

    if (this.cache.has(normalised)) {
      return this.cache.get(normalised)!.coordinates;
    }

    const result = await this.client.geocode(address);
    this.cache.set(normalised, result);
    return result.coordinates;
  }

  async resolveMany(addresses: string[]): Promise<Map<string, Coordinates>> {
    const results = new Map<string, Coordinates>();
    // Resolve in parallel, up to 10 at a time to avoid rate limits
    const chunks: string[][] = [];
    for (let i = 0; i < addresses.length; i += 10) {
      chunks.push(addresses.slice(i, i + 10));
    }
    for (const chunk of chunks) {
      const resolved = await Promise.all(chunk.map(addr => this.resolve(addr)));
      chunk.forEach((addr, idx) => results.set(addr, resolved[idx]));
    }
    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
