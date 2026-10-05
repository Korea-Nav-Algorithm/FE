import { haversineMeters } from './geo.ts';
import { getJson, postJson } from './httpClient.ts';
import { routeRequestPayload } from './apiPayloads.ts';
import type { Coordinate, RouteResult, RoutingAlgorithm } from '../types/navigation';

export interface RouteProvider { getRoute(origin: Coordinate, destination: Coordinate, algorithm: RoutingAlgorithm): Promise<RouteResult> }

export const mockMode = import.meta.env?.DEV === true && import.meta.env.VITE_USE_MOCK_API === 'true';

export class ApiRouteProvider implements RouteProvider {
  getRoute(origin: Coordinate, destination: Coordinate, algorithm: RoutingAlgorithm): Promise<RouteResult> {
    return postJson('/routes', routeRequestPayload(origin, destination, algorithm));
  }

  getSavedRoute(routeId: string): Promise<RouteResult> {
    return getJson(`/routes/${encodeURIComponent(routeId)}`);
  }
}

export class MockRouteProvider implements RouteProvider {
  async getRoute(origin: Coordinate, destination: Coordinate, algorithm: RoutingAlgorithm): Promise<RouteResult> {
    const direct = haversineMeters(origin, destination);
    // Clearly marked straight line: the mock is for UI/logging tests, never road guidance.
    return { routeId: crypto.randomUUID(), algorithm, algorithmVersion: 'mock', distanceMeters: Math.round(direct), durationSeconds: Math.max(60, Math.round(direct / 9)), geometry: [origin, destination], segments: [] };
  }
}

export const routeProvider: RouteProvider = mockMode ? new MockRouteProvider() : new ApiRouteProvider();

/** Restore the original Edge route; mock routes have no server persistence. */
export function restoreRoute(routeId: string, origin: Coordinate, destination: Coordinate, algorithm: RoutingAlgorithm): Promise<RouteResult> {
  return mockMode ? routeProvider.getRoute(origin, destination, algorithm) : new ApiRouteProvider().getSavedRoute(routeId);
}
