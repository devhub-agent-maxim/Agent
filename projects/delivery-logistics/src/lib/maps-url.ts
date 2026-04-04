export function buildGoogleMapsUrl(addresses: string[]): string {
  if (addresses.length === 0) return 'https://www.google.com/maps'
  if (addresses.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addresses[0])}&travelmode=driving`
  }
  const origin = encodeURIComponent(addresses[0])
  const destination = encodeURIComponent(addresses[addresses.length - 1])
  const waypoints = addresses.slice(1, -1).map(encodeURIComponent).join('|')
  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
  return waypoints ? `${base}&waypoints=${waypoints}` : base
}

export function buildSingleStopUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
}
