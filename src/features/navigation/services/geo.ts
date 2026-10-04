import type { Coordinate, GpsPoint } from '../types/navigation';

export function haversineMeters(first: Coordinate, second: Coordinate): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (second.lat - first.lat) * radians;
  const longitudeDelta = (second.lng - first.lng) * radians;
  const arc = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(first.lat * radians) * Math.cos(second.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function coordinateOf(point: GpsPoint): Coordinate { return { lat: point.latitude, lng: point.longitude }; }

/** GPS and persisted speed are metres per second. */
export function speedMetersPerSecond(current: GpsPoint, previous: GpsPoint | null): number | null {
  if (current.speed !== null && Number.isFinite(current.speed)) return Math.max(0, current.speed);
  if (!previous || current.timestamp <= previous.timestamp) return null;
  const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000;
  if (elapsedSeconds > 15) return null;
  return haversineMeters(coordinateOf(previous), coordinateOf(current)) / elapsedSeconds;
}

export function speedKmh(current: GpsPoint, previous: GpsPoint | null): number | null {
  const metresPerSecond = speedMetersPerSecond(current, previous);
  return metresPerSecond === null ? null : metresPerSecond * 3.6;
}

/** Minimum distance to a route line, using a local metre projection. */
export function distanceToRouteMeters(point: Coordinate, geometry: Coordinate[]): number {
  if (geometry.length === 0) return Infinity;
  if (geometry.length === 1) return haversineMeters(point, geometry[0]);
  return Math.min(...geometry.slice(0, -1).map((_, index) => distanceToSegmentMeters(point, geometry[index], geometry[index + 1])));
}

export function distanceToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const scaleX = 111320 * Math.cos(point.lat * Math.PI / 180);
  const scaleY = 111320;
  const startX = (start.lng - point.lng) * scaleX;
  const startY = (start.lat - point.lat) * scaleY;
  const endX = (end.lng - point.lng) * scaleX;
  const endY = (end.lat - point.lat) * scaleY;
  const lengthSquared = (endX - startX) ** 2 + (endY - startY) ** 2;
  const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(startX * (endX - startX) + startY * (endY - startY)) / lengthSquared));
  return Math.hypot(startX + progress * (endX - startX), startY + progress * (endY - startY));
}

export function nearestRouteSegmentIndex(point: Coordinate, geometry: Coordinate[]): number | null {
  if (geometry.length < 2) return null;
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let index = 0; index < geometry.length - 1; index++) {
    const distance = distanceToSegmentMeters(point, geometry[index], geometry[index + 1]);
    if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
  }
  return nearestIndex;
}

export function remainingDistanceMeters(point: Coordinate, geometry: Coordinate[]): number {
  if (!geometry.length) return 0;
  if (geometry.length === 1) return 0;
  let nearestIndex = 0;
  let nearest = Infinity;
  geometry.forEach((coordinate, index) => { const distance = haversineMeters(point, coordinate); if (distance < nearest) { nearest = distance; nearestIndex = index; } });
  let remaining = nearest;
  for (let index = nearestIndex; index < geometry.length - 1; index++) remaining += haversineMeters(geometry[index], geometry[index + 1]);
  return remaining;
}
