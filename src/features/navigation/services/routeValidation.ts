import type { RouteResult } from '../types/navigation';

/** A single coordinate is valid only for a zero-distance graph match. */
export function isUsableRoute(route: RouteResult): boolean {
  if (!route || !Array.isArray(route.geometry) || !route.geometry.every((point) => Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point?.lng) && Math.abs(point.lng) <= 180)) return false;
  if (!route.routeId || !['BASELINE', 'DIRECTION_AWARE', null].includes(route.algorithm) || (route.algorithmVersion !== null && typeof route.algorithmVersion !== 'string') || !Array.isArray(route.segments)) return false;
  if (!Number.isSafeInteger(route.distanceMeters) || !Number.isSafeInteger(route.durationSeconds) || route.distanceMeters < 0 || route.durationSeconds < 0) return false;
  if (route.trafficSource !== undefined && !['JSON', 'GYEONGGI', 'UNKNOWN'].includes(route.trafficSource)) return false;
  if (!route.segments.every((segment) => {
    if (segment.trafficLevel !== undefined && !['UNKNOWN', 'FREE', 'SLOW', 'CONGESTED'].includes(segment.trafficLevel)) return false;
    const start = segment.geometryStartIndex;
    const end = segment.geometryEndIndex;
    return (start == null && end == null) || (Number.isSafeInteger(start) && Number.isSafeInteger(end)
      && start! >= 0 && end! > start! && end! < route.geometry.length);
  })) return false;
  if (route.instructions !== undefined && (!Array.isArray(route.instructions) || !route.instructions.every((instruction) =>
    ['START', 'CONTINUE', 'SLIGHT_LEFT', 'TURN_LEFT', 'SLIGHT_RIGHT', 'TURN_RIGHT', 'U_TURN', 'ARRIVE'].includes(instruction.type)
    && Number.isSafeInteger(instruction.geometryIndex) && instruction.geometryIndex >= 0 && instruction.geometryIndex < route.geometry.length
    && Number.isSafeInteger(instruction.distanceFromStartMeters) && instruction.distanceFromStartMeters >= 0
    && typeof instruction.roadName === 'string' && Number.isFinite(instruction.coordinate?.lat) && Number.isFinite(instruction.coordinate?.lng)))) return false;
  return route.geometry.length >= 2 || (route.geometry.length === 1 && route.distanceMeters === 0 && route.durationSeconds === 0);
}
