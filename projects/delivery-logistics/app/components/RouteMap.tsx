'use client';

import dynamic from 'next/dynamic';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-48 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-sm gap-2">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Loading map...
    </div>
  ),
});

// Hex colours matching DRIVER_COLORS in RouteResults (index-aligned)
const DRIVER_HEX_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f97316', // orange
  '#a855f7', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ef4444', // red
  '#14b8a6', // teal
  '#6366f1', // indigo
];

interface RouteMapProps {
  /** Stop addresses (used as labels) */
  addresses?: string[];
  /** Geocoded coordinates — index-aligned with addresses. May contain nulls. */
  coordinates?: Array<{ lat: number; lng: number } | null | undefined>;
  /** Driver index for colour coding */
  driverIndex?: number;
}

export default function RouteMap({ addresses = [], coordinates = [], driverIndex = 0 }: RouteMapProps) {
  const color = DRIVER_HEX_COLORS[driverIndex % DRIVER_HEX_COLORS.length];

  // Build stop list from whatever coordinates we have
  const stops = coordinates
    .map((c, i) =>
      c ? { lat: c.lat, lng: c.lng, label: String(i + 1) } : null
    )
    .filter((s): s is { lat: number; lng: number; label: string } => s !== null);

  // Show map regardless — if no coordinates yet, map opens on Singapore center
  // and shows a note. Once coordinates arrive, markers render automatically.
  return (
    <div className="space-y-1">
      <LeafletMap stops={stops} color={color} />
      {addresses.length > 0 && stops.length === 0 && (
        <p className="text-xs text-slate-500 text-center">
          Map shows stops after route is planned with real coordinates.
        </p>
      )}
      {stops.length > 0 && stops.length < addresses.length && (
        <p className="text-xs text-slate-500 text-right">
          {stops.length} of {addresses.length} stops plotted.
        </p>
      )}
    </div>
  );
}
