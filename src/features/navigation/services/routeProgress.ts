import type { Coordinate, RouteInstruction, RouteResult } from '../types/navigation';
import { haversineMeters } from './geo.ts';

export interface RouteProgress { alongMeters: number; totalMeters: number; distanceFromRouteMeters: number }
export interface UpcomingInstruction { instruction: RouteInstruction; distanceMeters: number }

/** Weights remaining route time by each edge's effective speed when its geometry range is complete. */
export function remainingRouteSeconds(route: RouteResult, alongGeometryMeters: number): number {
  const lengths = route.geometry.slice(0, -1).map((point, index) => haversineMeters(point, route.geometry[index + 1]));
  const totalMeters = lengths.reduce((sum, length) => sum + length, 0);
  if (totalMeters <= 0 || route.durationSeconds <= 0) return Math.max(0, route.durationSeconds);
  const progress = Math.max(0, Math.min(totalMeters, alongGeometryMeters));
  const fallback = Math.round(route.durationSeconds * (1 - progress / totalMeters));
  const legSpeeds: Array<number | null> = Array(lengths.length).fill(null);
  const legacyAlignment = route.segments.length === lengths.length
    && route.segments.every((segment) => segment.geometryStartIndex == null && segment.geometryEndIndex == null);
  for (let index = 0; index < route.segments.length; index++) {
    const segment = route.segments[index];
    if (!Number.isFinite(segment.effectiveSpeed) || segment.effectiveSpeed <= 0) return fallback;
    const start = legacyAlignment ? index : segment.geometryStartIndex;
    const end = legacyAlignment ? index + 1 : segment.geometryEndIndex;
    if (start == null || end == null || !Number.isInteger(start) || !Number.isInteger(end)
      || start < 0 || end <= start || end > lengths.length) return fallback;
    for (let leg = start; leg < end; leg++) {
      if (legSpeeds[leg] !== null) return fallback;
      legSpeeds[leg] = segment.effectiveSpeed;
    }
  }
  if (legSpeeds.some((speed) => speed === null)) return fallback;
  let elapsedMeters = 0;
  let totalCost = 0;
  let remainingCost = 0;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    const cost = length / legSpeeds[index]!;
    totalCost += cost;
    remainingCost += cost * (length === 0 ? 0 : Math.max(0, Math.min(1, (elapsedMeters + length - progress) / length)));
    elapsedMeters += length;
  }
  return totalCost > 0 ? Math.round(route.durationSeconds * remainingCost / totalCost) : fallback;
}

/** Projects GPS onto the route line; previous progress discourages jumps to a nearby parallel leg. */
export function projectRouteProgress(point: Coordinate, geometry: Coordinate[], previousAlongMeters: number | null): RouteProgress {
  if (geometry.length === 0) return { alongMeters: 0, totalMeters: 0, distanceFromRouteMeters: Infinity };
  if (geometry.length === 1) return { alongMeters: 0, totalMeters: 0, distanceFromRouteMeters: haversineMeters(point, geometry[0]) };

  let travelled = 0;
  let totalMeters = 0;
  let bestScore = Infinity;
  let bestAlong = 0;
  let closestMeters = Infinity;
  for (let index = 0; index < geometry.length - 1; index++) {
    const start = geometry[index];
    const end = geometry[index + 1];
    const segmentLength = haversineMeters(start, end);
    const longitudeScale = 111320 * Math.cos(point.lat * Math.PI / 180);
    const startX = (start.lng - point.lng) * longitudeScale;
    const startY = (start.lat - point.lat) * 111320;
    const endX = (end.lng - point.lng) * longitudeScale;
    const endY = (end.lat - point.lat) * 111320;
    const lengthSquared = (endX - startX) ** 2 + (endY - startY) ** 2;
    const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      -(startX * (endX - startX) + startY * (endY - startY)) / lengthSquared));
    const distance = Math.hypot(startX + fraction * (endX - startX), startY + fraction * (endY - startY));
    const along = travelled + segmentLength * fraction;
    const backwardPenalty = previousAlongMeters === null ? 0 : Math.max(0, previousAlongMeters - along - 25) * 0.5;
    const score = distance + backwardPenalty;
    if (score < bestScore) { bestScore = score; bestAlong = along; }
    closestMeters = Math.min(closestMeters, distance);
    travelled += segmentLength;
    totalMeters += segmentLength;
  }
  return { alongMeters: bestAlong, totalMeters, distanceFromRouteMeters: closestMeters };
}

/** Chooses the next cue using the same distance scale as the Backend route. */
export function upcomingInstruction(route: RouteResult, progressMeters: number): UpcomingInstruction | null {
  const instructions = route.instructions;
  if (!instructions?.length) return null;
  const next = instructions.find((instruction) => instruction.type !== 'START'
    && instruction.distanceFromStartMeters >= progressMeters - 10) || instructions[instructions.length - 1];
  return { instruction: next, distanceMeters: Math.max(0, next.distanceFromStartMeters - progressMeters) };
}
