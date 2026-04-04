/**
 * Maximum number of waypoints Google Maps Directions URL supports.
 * Total limit is 25 points: 1 origin + 23 waypoints + 1 destination = 25.
 */
const MAX_GOOGLE_WAYPOINTS = 23;
const MAX_GOOGLE_POINTS = MAX_GOOGLE_WAYPOINTS + 2; // 25

/**
 * Builds a single Google Maps Directions URL for the given addresses.
 * If there are more than 25 total points, only the first chunk is returned
 * (backward compatible). Use buildGoogleMapsUrls() for the full split.
 */
export function buildGoogleMapsUrl(addresses: string[]): string {
  const urls = buildGoogleMapsUrls(addresses);
  return urls[0] ?? 'https://www.google.com/maps';
}

/**
 * Builds one or more Google Maps Directions URLs, splitting into chunks
 * of max 25 points each when the address list exceeds the Google Maps limit.
 *
 * Each chunk overlaps by 1 address: the last address of chunk N becomes
 * the origin of chunk N+1, so the driver continues seamlessly.
 */
export function buildGoogleMapsUrls(addresses: string[]): string[] {
  if (addresses.length === 0) return ['https://www.google.com/maps'];
  if (addresses.length === 1) {
    return [
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addresses[0])}&travelmode=driving`,
    ];
  }

  // If within limit, return a single URL
  if (addresses.length <= MAX_GOOGLE_POINTS) {
    return [buildSingleChunkUrl(addresses)];
  }

  // Split into chunks of MAX_GOOGLE_POINTS, overlapping by 1
  const urls: string[] = [];
  let start = 0;
  while (start < addresses.length - 1) {
    const end = Math.min(start + MAX_GOOGLE_POINTS, addresses.length);
    const chunk = addresses.slice(start, end);
    urls.push(buildSingleChunkUrl(chunk));
    start = end - 1; // overlap: last point of this chunk = first of next
  }

  return urls;
}

function buildSingleChunkUrl(addresses: string[]): string {
  if (addresses.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addresses[0])}&travelmode=driving`;
  }
  const origin = encodeURIComponent(addresses[0]);
  const destination = encodeURIComponent(addresses[addresses.length - 1]);
  const waypoints = addresses.slice(1, -1).map(encodeURIComponent).join('|');
  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  return waypoints ? `${base}&waypoints=${waypoints}` : base;
}

export function buildSingleStopUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
}
