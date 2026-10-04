import type { StoredGpsPoint, StoredTrip } from '../types/navigation';

const DATABASE_NAME = 'k-nav-trips';
const VERSION = 3;

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
      if (upgradeEvent.oldVersion < 3) {
        trips.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const trip = cursor.value as StoredTrip;
          cursor.update({ ...trip, clientTripId: trip.clientTripId || trip.localId, algorithm: trip.algorithm || 'DIRECTION_AWARE', ourEtaSeconds: trip.ourEtaSeconds ?? 0, ourDistanceMeters: trip.ourDistanceMeters ?? 0, tmapEtaSeconds: trip.tmapEtaSeconds ?? null, tmapDistanceMeters: trip.tmapDistanceMeters ?? null });
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
