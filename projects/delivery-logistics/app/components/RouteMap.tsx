'use client';

interface RouteMapProps {
  addresses?: string[];
}

// Singapore bounding box center
const SG_LAT = 1.3521;
const SG_LNG = 103.8198;
const SG_ZOOM = 12;

export default function RouteMap({ addresses }: RouteMapProps) {
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
        <p className="text-xs text-slate-600">Use "Open in Google Maps" to navigate.</p>
      </div>
    );
  }

  // Build static maps URL with markers for each address (up to 10 for readability)
  const displayed = addresses?.slice(0, 10) ?? [];
  const markers = displayed
    .map((addr, i) => `markers=label:${i + 1}|${encodeURIComponent(addr)}`)
    .join('&');

  const center = `${SG_LAT},${SG_LNG}`;
  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=${SG_ZOOM}&size=600x200&maptype=roadmap&${markers}&key=${apiKey}`;

  return (
    <div className="w-full h-48 rounded-lg overflow-hidden border border-slate-700">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Route map"
        className="w-full h-full object-cover"
        onError={(e) => {
          const target = e.currentTarget.parentElement;
          if (target) {
            target.innerHTML =
              '<div class="w-full h-full flex items-center justify-center text-slate-500 text-sm bg-slate-800">Map failed to load</div>';
          }
        }}
      />
    </div>
  );
}
