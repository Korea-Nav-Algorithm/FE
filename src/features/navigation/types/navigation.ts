export interface Coordinate { lat: number; lng: number }
export interface GpsPoint { timestamp: number; latitude: number; longitude: number; accuracy: number | null; speed: number | null; heading: number | null }
export interface RouteSegment { edgeId: string; observedSpeed: number; baseSpeed: number; attribution: number; effectiveSpeed: number }
export interface RouteResult { routeId: string; algorithm: RoutingAlgorithm | null; algorithmVersion: string | null; distanceMeters: number; durationSeconds: number; geometry: Coordinate[]; segments: RouteSegment[] }
export type RoutingAlgorithm = 'BASELINE' | 'DIRECTION_AWARE';
export type NavigationState = 'IDLE' | 'LOCATING' | 'ROUTE_READY' | 'DRIVING' | 'ARRIVED' | 'ERROR';
export interface TripState { tripId: string | null; startedAt: number | null; finishedAt: number | null; isLocal: boolean }
export interface StoredGpsPoint { id: string; tripId: string; point: GpsPoint; synced: boolean }
export interface StoredTrip { localId: string; clientTripId: string; serverId: string | null; routeId: string; algorithm: RoutingAlgorithm; startedAt: number; origin: Coordinate; destination: Coordinate; ourEtaSeconds: number; ourDistanceMeters: number; tmapEtaSeconds: number | null; tmapDistanceMeters: number | null; finishedAt: number | null; syncedStart: boolean; syncedFinish: boolean }
