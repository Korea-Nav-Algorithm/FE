import { gpsStore } from './gpsStore.ts';
import { mockMode } from './providers.ts';
import { ApiError, postJson } from './httpClient.ts';
import { gpsBatchPayload, tripCreatePayload, tripFinishPayload } from './apiPayloads.ts';
import { NAVIGATION_CONFIG } from './config.ts';
import { createTripAccessKey } from './tripAccessKey.ts';
import type { Coordinate, GpsPoint, RoutingAlgorithm, StoredTrip } from '../types/navigation';

export type SyncStep = 'trip' | 'points' | 'routes' | 'finish';
export type SyncStepStatus = 'IDLE' | 'PENDING' | 'SYNCED' | 'FAILED' | 'OFFLINE' | `FAILED ${number}${string}`;
export type SyncDiagnostics = Record<SyncStep, SyncStepStatus>;
const syncDiagnostics: SyncDiagnostics = { trip: 'IDLE', points: 'IDLE', routes: 'IDLE', finish: 'IDLE' };
const listeners = new Set<(diagnostics: SyncDiagnostics) => void>();

function report(step: SyncStep, status: SyncStepStatus): void {
  syncDiagnostics[step] = status;
  listeners.forEach((listener) => listener({ ...syncDiagnostics }));
}

function failureStatus(failure: unknown): SyncStepStatus {
  return failure instanceof ApiError ? `FAILED ${failure.status}${failure.code ? ` ${failure.code}` : ''}` : 'FAILED';
}

export function subscribeSyncDiagnostics(listener: (diagnostics: SyncDiagnostics) => void): () => void {
  listeners.add(listener);
  listener({ ...syncDiagnostics });
  return () => { listeners.delete(listener); };
}

async function startRemoteTrip(trip: StoredTrip): Promise<string> {
  if (mockMode) return trip.localId;
  const response = await postJson<{ tripId: string; clientTripId: string }>('/trips', tripCreatePayload(trip));
  if (!response?.tripId || response.clientTripId !== trip.clientTripId) throw new Error('Invalid trip response');
  return response.tripId;
}

interface GpsBatchResponse { pointsReceived: number; pointsStored: number }

function isCompleteBatch(response: GpsBatchResponse, expected: number): boolean {
  return response?.pointsReceived === expected && Number.isInteger(response.pointsStored) && response.pointsStored >= 0 && response.pointsStored <= expected;
}

/** Local trip IDs remain stable; queued points refer to them until a server ID exists. */
export async function createTrip(routeId: string, origin: Coordinate, destination: Coordinate, algorithm: RoutingAlgorithm, ourEtaSeconds: number, ourDistanceMeters: number, benchmark: { tmapEtaSeconds: number | null; tmapDistanceMeters: number | null }): Promise<StoredTrip> {
  const clientTripId = crypto.randomUUID();
  const trip: StoredTrip = { localId: clientTripId, clientTripId, accessKey: createTripAccessKey(), serverId: null, routeId, reroutes: [], algorithm, startedAt: Date.now(), origin, destination, ourEtaSeconds, ourDistanceMeters, ...benchmark, finishedAt: null, syncedStart: false, syncedFinish: false };
  await gpsStore.saveTrip(trip);
  // Return as soon as local persistence succeeds; backend latency must not delay GPS recording.
  void syncTrips().catch(() => {});
  return trip;
}

export async function recordPoint(tripId: string, point: GpsPoint): Promise<void> {
  await gpsStore.savePoint({ id: crypto.randomUUID(), tripId, point, synced: false });
}

export async function recordReroute(tripId: string, routeId: string): Promise<void> {
  await gpsStore.appendReroute(tripId, routeId, Date.now());
  void syncTrips().catch(() => {});
}

let syncing = false;
export async function syncTrips(): Promise<void> {
  if (syncing) return;
  if (!navigator.onLine) {
    for (const step of ['trip', 'points', 'routes', 'finish'] as const) report(step, 'OFFLINE');
    return;
  }
  syncing = true;
  try {
    const trips = (await gpsStore.getTrips()).sort((first, second) => first.startedAt - second.startedAt);
    const points = await gpsStore.getPoints();
    for (const storedTrip of trips) {
      let trip = storedTrip;
      if (!trip.syncedStart) {
        report('trip', 'PENDING');
        try {
          const serverId = await startRemoteTrip(trip);
          trip = await gpsStore.updateTrip(trip.localId, { serverId, syncedStart: true });
          report('trip', 'SYNCED');
        } catch (failure) { report('trip', failureStatus(failure)); continue; }
      } else report('trip', 'SYNCED');
      const pending = points.filter((point) => point.tripId === trip.localId && !point.synced).sort((a, b) => a.point.timestamp - b.point.timestamp);
      if (!pending.length) report('points', points.some((point) => point.tripId === trip.localId) ? 'SYNCED' : 'IDLE');
      for (let index = 0; index < pending.length; index += NAVIGATION_CONFIG.uploadBatchSize) {
        const batch = pending.slice(index, index + NAVIGATION_CONFIG.uploadBatchSize);
        try {
          report('points', 'PENDING');
          if (!mockMode) {
            const response = await postJson<GpsBatchResponse>(`/trips/${encodeURIComponent(trip.serverId!)}/points`, gpsBatchPayload(batch), { 'X-Trip-Key': trip.accessKey });
            if (!isCompleteBatch(response, batch.length)) throw new Error('Invalid GPS batch response');
          }
          await gpsStore.markSynced(batch.map(({ id }) => id));
          report('points', 'SYNCED');
        } catch (failure) { report('points', failureStatus(failure)); break; }
      }
      const stillPending = (await gpsStore.getPoints()).some((point) => point.tripId === trip.localId && !point.synced);
      const routeQueue = (await gpsStore.getTrip(trip.localId))?.reroutes || [];
      let routesSynced = true;
      report('routes', routeQueue.length ? 'SYNCED' : 'IDLE');
      for (const reroute of routeQueue.filter((item) => !item.synced)) {
        try {
          report('routes', 'PENDING');
          if (!mockMode) await postJson<void>(`/trips/${encodeURIComponent(trip.serverId!)}/routes`,
            { routeId: reroute.routeId, occurredAt: reroute.occurredAt }, { 'X-Trip-Key': trip.accessKey });
          await gpsStore.markRerouteSynced(trip.localId, reroute.routeId);
          report('routes', 'SYNCED');
        } catch (failure) { routesSynced = false; report('routes', failureStatus(failure)); break; }
      }
      const latestTrip = await gpsStore.getTrip(trip.localId);
      if (latestTrip?.syncedFinish) report('finish', 'SYNCED');
      else if (latestTrip?.finishedAt === null) report('finish', 'IDLE');
      if (latestTrip && latestTrip.finishedAt !== null && !latestTrip.syncedFinish && !stillPending && routesSynced) {
        try {
          report('finish', 'PENDING');
          if (!mockMode) await postJson<void>(`/trips/${encodeURIComponent(latestTrip.serverId!)}/finish`, tripFinishPayload(latestTrip), { 'X-Trip-Key': latestTrip.accessKey });
          await gpsStore.updateTrip(trip.localId, { syncedFinish: true });
          report('finish', 'SYNCED');
        } catch (failure) { report('finish', failureStatus(failure)); }
      }
    }
  } finally { syncing = false; }
}

export async function finishTrip(trip: StoredTrip): Promise<StoredTrip> {
  const finished = await gpsStore.updateTrip(trip.localId, { finishedAt: Date.now() });
  void syncTrips().catch(() => {});
  return finished;
}
