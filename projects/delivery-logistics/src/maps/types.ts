export interface Coordinates {
  lat: number;
  lng: number;
}

export interface DeliveryStop {
  id: string;
  address: string;
  label?: string;
  coordinates?: Coordinates;
}

export interface RouteSegment {
  from: DeliveryStop;
  to: DeliveryStop;
  distanceMeters: number;
  durationSeconds: number;
}

export interface OptimizedRoute {
  stops: DeliveryStop[];
  segments: RouteSegment[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

export interface DirectionsResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
}

export interface DistanceMatrixResult {
  origins: string[];
  destinations: string[];
  rows: Array<{
    elements: Array<{
      status: string;
      distance: { value: number; text: string };
      duration: { value: number; text: string };
    }>;
  }>;
}

export interface GeocodeResult {
  address: string;
  coordinates: Coordinates;
  formattedAddress: string;
}
