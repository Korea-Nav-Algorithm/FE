import type { Coordinate, RoutingAlgorithm, StoredGpsPoint, StoredTrip } from '../types/navigation';

/** A destination preset also has UI metadata; send only fields in the Backend Coordinate contract. */
function apiCoordinate(coordinate: Coordinate): Coordinate {
  return { lat: coordinate.lat, lng: coordinate.lng };
}

export function routeRequestPayload(origin: Coordinate, destination: Coordinate, algorithm: RoutingAlgorithm) {
  return { origin: apiCoordinate(origin), destination: apiCoordinate(destination), algorithm };
}

/** Build retry payloads from persisted IDs, never from new random values. */
export function tripCreatePayload(trip: StoredTrip) {
  return { clientTripId: trip.clientTripId || trip.localId, accessKey: trip.accessKey, routeId: trip.routeId, startedAt: trip.startedAt, origin: apiCoordinate(trip.origin), destination: apiCoordinate(trip.destination), ourEtaSeconds: trip.ourEtaSeconds ?? 0, tmapEtaSeconds: trip.tmapEtaSeconds ?? null, tmapDistanceMeters: trip.tmapDistanceMeters ?? null };
}

export function gpsBatchPayload(points: StoredGpsPoint[]) {
  return { points: points.map(({ id, point }) => ({ pointId: id, timestamp: point.timestamp, lat: point.latitude, lng: point.longitude, gpsSpeed: point.speed, heading: point.heading, accuracy: point.accuracy })) };
}

export function tripFinishPayload(trip: StoredTrip) {
  return { finishedAt: trip.finishedAt, actualDurationSeconds: Math.round(((trip.finishedAt ?? trip.startedAt) - trip.startedAt) / 1000) };
}
