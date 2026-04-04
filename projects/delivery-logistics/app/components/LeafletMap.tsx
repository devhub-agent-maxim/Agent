'use client';

import { useEffect, useRef } from 'react';

interface Stop {
  lat: number;
  lng: number;
  label: string;
}

interface LeafletMapProps {
  stops: Stop[];
  color: string;
}

export default function LeafletMap({ stops, color }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null);

  useEffect(() => {
    if (!containerRef.current || stops.length === 0) return;

    // Lazy-import leaflet so it only runs in the browser
    import('leaflet').then((L) => {
      // Fix default marker icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Destroy previous map instance to avoid "container already initialized" error
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current!, { zoomControl: true, attributionControl: false });
      mapRef.current = map;

      // OpenStreetMap tiles — free, no API key
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Draw route polyline
      const latLngs = stops.map((s) => L.latLng(s.lat, s.lng));
      L.polyline(latLngs, { color, weight: 3, opacity: 0.8 }).addTo(map);

      // Add numbered markers
      stops.forEach((stop) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            background:${color};
            color:#fff;
            width:22px;
            height:22px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:10px;
            font-weight:700;
            border:2px solid rgba(255,255,255,0.8);
            box-shadow:0 1px 4px rgba(0,0,0,0.4);
          ">${stop.label}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([stop.lat, stop.lng], { icon }).addTo(map);
      });

      // Fit map to show all markers
      map.fitBounds(L.latLngBounds(latLngs), { padding: [16, 16] });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Re-render when stops or color changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stops), color]);

  return (
    <>
      {/* Leaflet CSS */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div
        ref={containerRef}
        className="w-full h-48 rounded-lg overflow-hidden border border-slate-700"
        style={{ minHeight: '192px' }}
      />
    </>
  );
}
