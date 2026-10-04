import type { StoredGpsPoint, StoredTrip } from '../types/navigation';

/** Build retry payloads from persisted IDs, never from new random values. */
export function tripCreatePayload(trip: StoredTrip) {
  return { clientTripId: trip.clientTripId || trip.localId, routeId: trip.routeId, startedAt: trip.startedAt, origin: trip.origin, destination: trip.destination, ourEtaSeconds: trip.ourEtaSeconds ?? 0, tmapEtaSeconds: trip.tmapEtaSeconds ?? null, tmapDistanceMeters: trip.tmapDistanceMeters ?? null };
}

export function gpsBatchPayload(points: StoredGpsPoint[]) {
  return { points: points.map(({ id, point }) => ({ pointId: id, timestamp: point.timestamp, lat: point.latitude, lng: point.longitude, gpsSpeed: point.speed, heading: point.heading, accuracy: point.accuracy })) };
}

export function tripFinishPayload(trip: StoredTrip) {
  return { finishedAt: trip.finishedAt, actualDurationSeconds: Math.round(((trip.finishedAt ?? trip.startedAt) - trip.startedAt) / 1000) };
}
