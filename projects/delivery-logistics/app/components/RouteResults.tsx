'use client';

import { useState } from 'react';
import type { DriverRoute } from '../../src/routes/multi-driver';
import RouteMap from './RouteMap';

interface RouteResultsProps {
  routes: DriverRoute[];
  planId: string;
  driverNames: string[];
}

const DRIVER_COLORS = [
  { bg: 'bg-blue-500/10', border: 'border-blue-500/30', badge: 'bg-blue-500', text: 'text-blue-400' },
  { bg: 'bg-green-500/10', border: 'border-green-500/30', badge: 'bg-green-500', text: 'text-green-400' },
  { bg: 'bg-orange-500/10', border: 'border-orange-500/30', badge: 'bg-orange-500', text: 'text-orange-400' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/30', badge: 'bg-purple-500', text: 'text-purple-400' },
  { bg: 'bg-pink-500/10', border: 'border-pink-500/30', badge: 'bg-pink-500', text: 'text-pink-400' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', badge: 'bg-cyan-500', text: 'text-cyan-400' },
  { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', badge: 'bg-yellow-500', text: 'text-yellow-400' },
  { bg: 'bg-red-500/10', border: 'border-red-500/30', badge: 'bg-red-500', text: 'text-red-400' },
  { bg: 'bg-teal-500/10', border: 'border-teal-500/30', badge: 'bg-teal-500', text: 'text-teal-400' },
  { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', badge: 'bg-indigo-500', text: 'text-indigo-400' },
];

function buildGoogleMapsUrls(stops: DriverRoute['stops']): string[] {
  if (stops.length === 0) return ['https://maps.google.com'];
  const addresses = stops.map((s) => s.address);

  const MAX_POINTS = 25;
  if (addresses.length <= MAX_POINTS) {
    return [buildChunkUrl(addresses)];
  }

  const urls: string[] = [];
  let start = 0;
  while (start < addresses.length - 1) {
    const end = Math.min(start + MAX_POINTS, addresses.length);
    urls.push(buildChunkUrl(addresses.slice(start, end)));
    start = end - 1;
  }
  return urls;
}

function buildChunkUrl(addresses: string[]): string {
  if (addresses.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
  }
  const origin = encodeURIComponent(addresses[0]);
  const dest = encodeURIComponent(addresses[addresses.length - 1]);
  const waypoints = addresses.slice(1, -1).map(encodeURIComponent).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  url += '&travelmode=driving';
  return url;
}

function formatDistance(meters: number): string {
  if (meters === 0) return '—';
  return (meters / 1000).toFixed(1) + ' km';
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface CopyButtonProps {
  text: string;
  label: string;
}

function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

export default function RouteResults({ routes, planId, driverNames }: RouteResultsProps) {
  const [activeTab, setActiveTab] = useState(0);

  const activeRoute = routes[activeTab];
  const color = DRIVER_COLORS[activeTab % DRIVER_COLORS.length];
  const driverName = driverNames[activeTab] || activeRoute.driverName;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const driverLink = `${origin}/driver/${planId}?driver=${activeTab}`;
  const mapsUrls = buildGoogleMapsUrls(activeRoute.stops);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-lg p-3 text-center border border-slate-700">
          <div className="text-2xl font-bold text-white">{routes.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Drivers</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-3 text-center border border-slate-700">
          <div className="text-2xl font-bold text-white">
            {routes.reduce((sum, r) => sum + r.stops.length, 0)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Total stops</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-3 text-center border border-slate-700">
          <div className="text-2xl font-bold text-white">
            {formatDistance(routes.reduce((sum, r) => sum + r.totalDistanceMeters, 0))}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Total distance</div>
        </div>
      </div>

      {/* Driver tabs */}
      <div className="flex gap-2 flex-wrap">
        {routes.map((route, i) => {
          const c = DRIVER_COLORS[i % DRIVER_COLORS.length];
          const name = driverNames[i] || route.driverName;
          return (
            <button
              key={route.driverId}
              type="button"
              onClick={() => setActiveTab(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === i
                  ? `${c.bg} ${c.border} ${c.text}`
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {name}
              <span className="ml-1.5 text-xs opacity-60">({route.stops.length})</span>
            </button>
          );
        })}
      </div>

      {/* Active driver card */}
      <div className={`rounded-xl border ${color.bg} ${color.border} p-4 space-y-4`}>
        {/* Driver header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${color.badge}`} />
              <h3 className="text-base font-semibold text-white">{driverName}</h3>
            </div>
            <div className="flex gap-4 mt-1 text-sm text-slate-400">
              <span>{activeRoute.stops.length} stops</span>
              <span>{formatDistance(activeRoute.totalDistanceMeters)}</span>
              <span>{formatDuration(activeRoute.totalDurationSeconds)}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {mapsUrls.length === 1 ? (
              <a
                href={mapsUrls[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Open in Maps
              </a>
            ) : (
              mapsUrls.map((url, partIdx) => {
                const partStart = partIdx * 24 + 1;
                const partEnd = Math.min(partStart + 24, activeRoute.stops.length);
                return (
                  <a
                    key={partIdx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Navigate Part {partIdx + 1} (stops {partStart}-{partEnd})
                  </a>
                );
              })
            )}
            <CopyButton text={driverLink} label="Copy driver link" />
          </div>
        </div>

        {/* Leaflet map — shows all stops with coloured markers + route line */}
        <RouteMap
          addresses={activeRoute.stops.map((s) => s.address)}
          coordinates={activeRoute.stops.map((s) => s.coordinates ?? null)}
          driverIndex={activeTab}
        />

        {/* Stop list */}
        {activeRoute.stops.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No stops assigned to this driver.</p>
        ) : (
          <ol className="space-y-1.5">
            {activeRoute.stops.map((stop, i) => (
              <li key={stop.id} className="flex items-start gap-3 py-2 px-3 bg-slate-900/50 rounded-lg">
                <span className={`shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white ${color.badge}`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{stop.address}</p>
                  {stop.label && stop.label !== `Stop ${i + 1}` && (
                    <p className="text-xs text-slate-500">{stop.label}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
