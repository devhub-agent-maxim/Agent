'use client';

import dynamic from 'next/dynamic';

// Leaflet requires browser APIs — must be loaded client-side only
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-48 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-sm">
      Loading map...
    </div>
  ),
});

// Hex colours matching the DRIVER_COLORS array in RouteResults
const DRIVER_HEX_COLORS = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#f97316', // orange-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#eab308', // yellow-500
  '#ef4444', // red-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
];

interface RouteMapProps {
  addresses?: string[];
  coordinates?: Array<{ lat: number; lng: number } | null | undefined>;
  driverIndex?: number;
}

export default function RouteMap({ addresses, coordinates, driverIndex = 0 }: RouteMapProps) {
  const color = DRIVER_HEX_COLORS[driverIndex % DRIVER_HEX_COLORS.length];

  // Build stop list: use coordinates where available, skip null entries
  const stops = (coordinates ?? [])
    .map((c, i) => (c ? { lat: c.lat, lng: c.lng, label: String(i + 1) } : null))
    .filter((s): s is { lat: number; lng: number; label: string } => s !== null);

  if (stops.length === 0) {
    return (
      <div className="w-full h-48 rounded-lg bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 text-slate-500">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <p className="text-sm font-medium">Map preview</p>
        <p className="text-xs text-slate-600">
          {addresses && addresses.length > 0
            ? 'Route optimized — map visible after geocoding'
            : 'Add stops to see the route map'}
        </p>
      </div>
    );
  }

  return <LeafletMap stops={stops} color={color} />;
}
