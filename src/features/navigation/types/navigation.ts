export interface Coordinate { lat: number; lng: number }
export interface GpsPoint { timestamp: number; latitude: number; longitude: number; accuracy: number | null; speed: number | null; heading: number | null }
export type TrafficLevel = 'UNKNOWN' | 'FREE' | 'SLOW' | 'CONGESTED';
export interface RouteSegment { edgeId: string; observedSpeed: number; baseSpeed: number; attribution: number; effectiveSpeed: number; trafficLevel?: TrafficLevel; geometryStartIndex?: number | null; geometryEndIndex?: number | null }
export type ManeuverType = 'START' | 'CONTINUE' | 'SLIGHT_LEFT' | 'TURN_LEFT' | 'SLIGHT_RIGHT' | 'TURN_RIGHT' | 'U_TURN' | 'ARRIVE';
export interface RouteInstruction { type: ManeuverType; geometryIndex: number; distanceFromStartMeters: number; roadName: string; coordinate: Coordinate }
export interface RouteResult { routeId: string; algorithm: RoutingAlgorithm | null; algorithmVersion: string | null; distanceMeters: number; durationSeconds: number; geometry: Coordinate[]; segments: RouteSegment[]; instructions?: RouteInstruction[]; trafficSource?: 'JSON' | 'GYEONGGI' | 'UNKNOWN' }
export type RoutingAlgorithm = 'BASELINE' | 'DIRECTION_AWARE';
export type NavigationState = 'IDLE' | 'LOCATING' | 'ROUTE_READY' | 'DRIVING' | 'ARRIVED' | 'ERROR';
export interface TripState { tripId: string | null; startedAt: number | null; finishedAt: number | null; isLocal: boolean }
export interface StoredGpsPoint { id: string; tripId: string; point: GpsPoint; synced: boolean }
export interface StoredReroute { routeId: string; occurredAt: number; synced: boolean }
export interface StoredTrip { localId: string; clientTripId: string; accessKey: string; serverId: string | null; routeId: string; reroutes: StoredReroute[]; algorithm: RoutingAlgorithm; startedAt: number; origin: Coordinate; destination: Coordinate; ourEtaSeconds: number; ourDistanceMeters: number; tmapEtaSeconds: number | null; tmapDistanceMeters: number | null; finishedAt: number | null; syncedStart: boolean; syncedFinish: boolean }
