'use client';

interface RouteMapProps {
  addresses?: string[];
  /** Driver index (0-based) used to colour markers. Defaults to 0 (blue). */
  driverIndex?: number;
}

// Singapore bounding box center
const SG_LAT = 1.3521;
const SG_LNG = 103.8198;
const SG_ZOOM = 12;

// Maps driverIndex → Google Static Maps marker colour name.
// Static Maps supports: black brown green purple yellow blue gray orange red white
const DRIVER_MAP_COLORS = [
  'blue',
  'green',
  'orange',
  'purple',
  'red',
  'blue',
  'yellow',
  'red',
  'green',
  'purple',
] as const;

// Max stops to show on the static map (keeps URL under ~4 kB)
const MAX_MAP_STOPS = 50;

// Label characters: 1-9 then A-Z (single char required by Static Maps API)
const LABEL_CHARS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function getLabel(i: number): string {
  return LABEL_CHARS[i] ?? 'Z';
}

export default function RouteMap({ addresses, driverIndex = 0 }: RouteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="w-full h-48 rounded-lg bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 text-slate-500">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
        <p className="text-sm font-medium">Map preview</p>
        <p className="text-xs text-center px-4">
          Set <code className="bg-slate-700 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to
          enable the map.
        </p>
        <p className="text-xs text-slate-600">Use &quot;Open in Google Maps&quot; to navigate.</p>
      </div>
    );
  }

  const color = DRIVER_MAP_COLORS[driverIndex % DRIVER_MAP_COLORS.length];
  const displayed = addresses?.slice(0, MAX_MAP_STOPS) ?? [];
  const truncated = (addresses?.length ?? 0) > MAX_MAP_STOPS;

  const markers = displayed
    .map((addr, i) => `markers=color:${color}|label:${getLabel(i)}|${encodeURIComponent(addr)}`)
    .join('&');

  const center = `${SG_LAT},${SG_LNG}`;
  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=${SG_ZOOM}&size=600x200&maptype=roadmap&${markers}&key=${apiKey}`;

  return (
    <div className="space-y-1">
      <div className="w-full h-48 rounded-lg overflow-hidden border border-slate-700 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Route map"
          className="w-full h-full object-cover"
          onError={(e) => {
            // Replace with a helpful error that tells the user exactly what to fix
            const target = e.currentTarget.parentElement;
            if (target) {
              target.innerHTML = `
                <div class="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-800 px-4 text-center">
                  <p class="text-slate-300 text-sm font-medium">Map failed to load</p>
                  <p class="text-slate-500 text-xs">Enable <strong class="text-slate-400">Maps Static API</strong> in Google Cloud Console for your API key, then redeploy.</p>
                  <a href="https://console.cloud.google.com/apis/library/static-maps-backend.googleapis.com" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-400 underline mt-1">Open Google Cloud Console →</a>
                </div>`;
            }
          }}
        />
      </div>
      {truncated && (
        <p className="text-xs text-slate-500 text-right">
          Showing first {MAX_MAP_STOPS} of {addresses?.length} stops on map.
        </p>
      )}
    </div>
  );
}
