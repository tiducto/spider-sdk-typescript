import type { LatLon } from './routing.ts';

export function decodePolyline(encoded: string): LatLon[] {
  if (encoded.length === 0) return [];
  const points: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (index >= encoded.length) return points;
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) return points;
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLon = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lon += dLon;

    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return points;
}
