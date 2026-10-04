import type { RouteResult } from '../types/navigation';

/** A single coordinate is valid only for a zero-distance graph match. */
export function isUsableRoute(route: RouteResult): boolean {
  if (!route || !Array.isArray(route.geometry) || !route.geometry.every((point) => Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point?.lng) && Math.abs(point.lng) <= 180)) return false;
  if (!route.routeId || !['BASELINE', 'DIRECTION_AWARE', null].includes(route.algorithm) || (route.algorithmVersion !== null && typeof route.algorithmVersion !== 'string') || !Array.isArray(route.segments)) return false;
  if (!Number.isSafeInteger(route.distanceMeters) || !Number.isSafeInteger(route.durationSeconds) || route.distanceMeters < 0 || route.durationSeconds < 0) return false;
  return route.geometry.length >= 2 || (route.geometry.length === 1 && route.distanceMeters === 0 && route.durationSeconds === 0);
}
