import { OptimizedRoute } from '../maps/types';

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function printRoute(route: OptimizedRoute): void {
  console.log('\n=== Optimized Delivery Route ===\n');
  console.log(`Total stops   : ${route.stops.length}`);
  console.log(`Total distance: ${formatDistance(route.totalDistanceMeters)}`);
  console.log(`Est. duration : ${formatDuration(route.totalDurationSeconds)}`);
  console.log('\nStop sequence:');

  route.stops.forEach((stop, idx) => {
    const label = stop.label ?? stop.address;
    console.log(`  ${idx + 1}. [${stop.id}] ${label}`);
    if (idx < route.segments.length) {
      const seg = route.segments[idx];
      console.log(`     → ${formatDistance(seg.distanceMeters)} / ${formatDuration(seg.durationSeconds)}`);
    }
  });

  console.log('\n================================\n');
}

export function printError(message: string): void {
  console.error(`\n[ERROR] ${message}\n`);
}
