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

// Singapore center fallback
const SG_CENTER: [number, number] = [1.3521, 103.8198];
const SG_ZOOM = 12;

export default function LeafletMap({ stops, color }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    import('leaflet').then((L) => {
      // Fix broken default icon paths from webpack bundling
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Remove old instance if stops/color changed
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false, // prevent page scroll hijack on mobile
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      if (stops.length === 0) {
        map.setView(SG_CENTER, SG_ZOOM);
        return;
      }

      // Draw route polyline
      const latLngs = stops.map((s) => L.latLng(s.lat, s.lng));
      L.polyline(latLngs, { color, weight: 3, opacity: 0.8 }).addTo(map);

      // Add numbered circle markers
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
            font-size:9px;
            font-weight:700;
            border:2px solid rgba(255,255,255,0.85);
            box-shadow:0 1px 4px rgba(0,0,0,0.45);
            box-sizing:border-box;
          ">${stop.label}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([stop.lat, stop.lng], { icon }).addTo(map);
      });

      // Fit all markers into view with padding
      map.fitBounds(L.latLngBounds(latLngs), { padding: [20, 20], maxZoom: 14 });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Stringify to detect actual data changes, not just reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stops), color]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-slate-700"
      style={{ height: '192px' }}
    />
  );
}
