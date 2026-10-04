import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { gpsStore } from '../src/features/navigation/services/gpsStore.ts';

test('version 1 trips gain stable clientTripId and keep pending points', async () => {
  const oldDatabase = await new Promise((resolve, reject) => {
    const request = indexedDB.open('k-nav-trips', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('trips', { keyPath: 'localId' });
      request.result.createObjectStore('points', { keyPath: 'id' }).createIndex('tripId', 'tripId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = oldDatabase.transaction(['trips', 'points'], 'readwrite');
    tx.objectStore('trips').put({ localId: 'legacy-trip', serverId: null, routeId: 'old-route', startedAt: 1, origin: { lat: 37, lng: 127 }, destination: { lat: 37.1, lng: 127.1 }, finishedAt: null, syncedStart: false, syncedFinish: false });
    tx.objectStore('points').put({ id: 'legacy-point', tripId: 'legacy-trip', synced: false, point: { timestamp: 1, latitude: 37, longitude: 127, accuracy: 5, speed: null, heading: null } });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  oldDatabase.close();

  const upgraded = await gpsStore.getTrip('legacy-trip');
  assert.equal(upgraded.clientTripId, 'legacy-trip');
  assert.equal(upgraded.algorithm, 'DIRECTION_AWARE');
  assert.equal(upgraded.ourEtaSeconds, 0);
  assert.equal(upgraded.ourDistanceMeters, 0);
  assert.equal(upgraded.tmapDistanceMeters, null);
  assert.equal((await gpsStore.getPoints()).find(({ id }) => id === 'legacy-point').synced, false);
});

test('GPS point is committed locally before sync status changes', async () => {
  const trip = { localId: 'offline-trip', clientTripId: 'offline-trip', serverId: null, routeId: 'route', algorithm: 'DIRECTION_AWARE', startedAt: 1, origin: { lat: 37, lng: 127 }, destination: { lat: 37.1, lng: 127.1 }, ourEtaSeconds: 60, ourDistanceMeters: 1000, tmapEtaSeconds: null, tmapDistanceMeters: null, finishedAt: null, syncedStart: false, syncedFinish: false };
  const point = { id: 'offline-point', tripId: trip.localId, synced: false, point: { timestamp: 1000, latitude: 37, longitude: 127, accuracy: 5, speed: null, heading: null } };
  await gpsStore.saveTrip(trip);
  await gpsStore.savePoint(point);
  assert.equal((await gpsStore.getTrip(trip.localId)).localId, trip.localId);
  assert.equal((await gpsStore.getPoints()).find(({ id }) => id === point.id).synced, false);
  await gpsStore.markSynced([point.id]);
  assert.equal((await gpsStore.getPoints()).find(({ id }) => id === point.id).synced, true);
});
