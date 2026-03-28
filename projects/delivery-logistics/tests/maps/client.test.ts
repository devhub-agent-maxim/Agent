import axios from 'axios';
import { MapsClient } from '../../src/maps/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MapsClient', () => {
  let client: MapsClient;
  const fakeAxiosInstance = {
    get: jest.fn(),
  };

  beforeEach(() => {
    mockedAxios.create.mockReturnValue(fakeAxiosInstance as any);
    client = new MapsClient('test-api-key');
  });

  afterEach(() => jest.clearAllMocks());

  it('throws if no API key provided', () => {
    expect(() => new MapsClient('')).toThrow('Google Maps API key is required');
  });

  describe('getDirections', () => {
    it('returns distance and duration on OK response', async () => {
      fakeAxiosInstance.get.mockResolvedValue({
        data: {
          status: 'OK',
          routes: [{
            legs: [{
              distance: { value: 5000 },
              duration: { value: 600 },
            }],
            overview_polyline: { points: 'abc' },
          }],
        },
      });

      const result = await client.getDirections('A', 'B');
      expect(result.distanceMeters).toBe(5000);
      expect(result.durationSeconds).toBe(600);
    });

    it('throws on non-OK status', async () => {
      fakeAxiosInstance.get.mockResolvedValue({
        data: { status: 'ZERO_RESULTS', error_message: 'No route' },
      });
      await expect(client.getDirections('A', 'B')).rejects.toThrow('ZERO_RESULTS');
    });
  });

  describe('geocode', () => {
    it('returns coordinates on OK response', async () => {
      fakeAxiosInstance.get.mockResolvedValue({
        data: {
          status: 'OK',
          results: [{
            geometry: { location: { lat: 1.3, lng: 103.8 } },
            formatted_address: 'Singapore',
          }],
        },
      });

      const result = await client.geocode('Singapore');
      expect(result.coordinates.lat).toBe(1.3);
      expect(result.coordinates.lng).toBe(103.8);
    });
  });
});
