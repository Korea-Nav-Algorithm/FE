import type { StoredGpsPoint, StoredTrip } from '../types/navigation';
import { createTripAccessKey } from './tripAccessKey.ts';

const DATABASE_NAME = 'k-nav-trips';
const VERSION = 5;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = (upgradeEvent) => {
      const database = request.result;
      if (!database.objectStoreNames.contains('points')) {
        const points = database.createObjectStore('points', { keyPath: 'id' });
        points.createIndex('tripId', 'tripId');
      }
      const trips = database.objectStoreNames.contains('trips') ? request.transaction!.objectStore('trips') : database.createObjectStore('trips', { keyPath: 'localId' });
      if (upgradeEvent.oldVersion < 5) {
        trips.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const trip = cursor.value as StoredTrip;
          const needsReplay = upgradeEvent.oldVersion < 4 && !!trip.serverId && !trip.syncedFinish;
          cursor.update({ ...trip, algorithm: trip.algorithm || 'DIRECTION_AWARE',
            ourEtaSeconds: trip.ourEtaSeconds ?? 0, ourDistanceMeters: trip.ourDistanceMeters ?? 0,
            tmapEtaSeconds: trip.tmapEtaSeconds ?? null, tmapDistanceMeters: trip.tmapDistanceMeters ?? null,
            accessKey: trip.accessKey || createTripAccessKey(),
            reroutes: (trip.reroutes || []).map((reroute) => needsReplay ? { ...reroute, synced: false } : reroute),
            clientTripId: needsReplay ? crypto.randomUUID() : (trip.clientTripId || trip.localId),
            serverId: needsReplay ? null : trip.serverId,
            syncedStart: needsReplay ? false : trip.syncedStart });
          if (needsReplay) {
            const pointIndex = request.transaction!.objectStore('points').index('tripId');
            pointIndex.openCursor(IDBKeyRange.only(trip.localId)).onsuccess = (pointEvent) => {
              const pointCursor = (pointEvent.target as IDBRequest<IDBCursorWithValue | null>).result;
              if (!pointCursor) return;
              pointCursor.update({ ...pointCursor.value as StoredGpsPoint, synced: false });
              pointCursor.continue();
            };
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<Result>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<Result>): Promise<Result> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    let result: Result;
    request.onsuccess = () => { result = request.result; };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.oncomplete = () => { database.close(); resolve(result); };
  });
}

export const gpsStore = {
  savePoint: (point: StoredGpsPoint): Promise<IDBValidKey> => transaction('points', 'readwrite', (store) => store.put(point)),
  saveTrip: (trip: StoredTrip): Promise<IDBValidKey> => transaction('trips', 'readwrite', (store) => store.put(trip)),
  getTrips: (): Promise<StoredTrip[]> => transaction('trips', 'readonly', (store) => store.getAll()),
  getTrip: (localId: string): Promise<StoredTrip | undefined> => transaction('trips', 'readonly', (store) => store.get(localId)),
  async updateTrip(localId: string, changes: Partial<StoredTrip>): Promise<StoredTrip> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('trips', 'readwrite');
      const store = tx.objectStore('trips');
      let updated: StoredTrip;
      const read = store.get(localId);
      read.onsuccess = () => {
        if (!read.result) { tx.abort(); return; }
        updated = { ...read.result as StoredTrip, ...changes };
        store.put(updated);
      };
      tx.oncomplete = () => { database.close(); resolve(updated); };
      tx.onabort = () => { database.close(); reject(tx.error || new Error('Trip not found')); };
      tx.onerror = () => { database.close(); reject(tx.error); };
    });
  },
  async appendReroute(localId: string, routeId: string, occurredAt: number): Promise<StoredTrip> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('trips', 'readwrite');
      const store = tx.objectStore('trips');
      let updated: StoredTrip;
      const read = store.get(localId);
      read.onsuccess = () => {
        if (!read.result) { tx.abort(); return; }
        const trip = read.result as StoredTrip;
        const reroutes = trip.reroutes || [];
        updated = { ...trip, reroutes: reroutes.some((reroute) => reroute.routeId === routeId)
          ? reroutes : [...reroutes, { routeId, occurredAt, synced: false }] };
        store.put(updated);
      };
      tx.oncomplete = () => { database.close(); resolve(updated); };
      tx.onabort = () => { database.close(); reject(tx.error || new Error('Trip not found')); };
      tx.onerror = () => { database.close(); reject(tx.error); };
    });
  },
  async markRerouteSynced(localId: string, routeId: string): Promise<void> {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('trips', 'readwrite');
      const store = tx.objectStore('trips');
      const read = store.get(localId);
      read.onsuccess = () => {
        if (read.result) store.put({ ...read.result as StoredTrip,
          reroutes: ((read.result as StoredTrip).reroutes || []).map((item) =>
            item.routeId === routeId ? { ...item, synced: true } : item) });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  },
  getPoints: (): Promise<StoredGpsPoint[]> => transaction('points', 'readonly', (store) => store.getAll()),
  async markSynced(ids: string[]): Promise<void> {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('points', 'readwrite');
      const store = tx.objectStore('points');
      ids.forEach((id) => { const request = store.get(id); request.onsuccess = () => { if (request.result) store.put({ ...request.result, synced: true }); }; });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  },
};
