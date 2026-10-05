import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { gpsStore } from '../src/features/navigation/services/gpsStore.ts';
import { createTrip, finishTrip, recordPoint, recordReroute, syncTrips } from '../src/features/navigation/services/tripSync.ts';

test('reroute ID is persisted before upload and replayed with the same trip key', async () => {
  const previousFetch = globalThis.fetch;
  const previousNavigator = globalThis.navigator;
  const network = { onLine: false };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network });
  const rerouteRequests = [];
  globalThis.fetch = async (path, options) => {
    if (path === '/api/trips') {
      const body = JSON.parse(options.body);
      return new Response(JSON.stringify({ tripId: 'server-reroute', clientTripId: body.clientTripId }), { status: 201 });
    }
    if (path === '/api/trips/server-reroute/routes') {
      rerouteRequests.push({ body: JSON.parse(options.body), key: options.headers['X-Trip-Key'] });
      if (rerouteRequests.length === 1) throw new TypeError('response lost');
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204 });
  };
  try {
    const place = { lat: 37, lng: 127 };
    const trip = await createTrip('initial-route', place, place, 'BASELINE', 60, 1000,
      { tmapEtaSeconds: null, tmapDistanceMeters: null });
    await recordReroute(trip.localId, 'reroute-1');
    assert.equal((await gpsStore.getTrip(trip.localId)).reroutes[0].synced, false);
    network.onLine = true;
    await syncTrips();
    assert.equal((await gpsStore.getTrip(trip.localId)).reroutes[0].synced, false);
    await syncTrips();
    assert.equal((await gpsStore.getTrip(trip.localId)).reroutes[0].synced, true);
    assert.deepEqual(rerouteRequests[0].body, rerouteRequests[1].body);
    assert.equal(rerouteRequests[0].key, trip.accessKey);
    assert.equal(rerouteRequests[1].key, trip.accessKey);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
  }
});

test('trip, point, and finish retries reuse persisted IDs and timing', async () => {
  const previousFetch = globalThis.fetch;
  const previousNavigator = globalThis.navigator;
  const network = { onLine: false };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network });
  const requests = { trip: [], points: [], finish: [], pointKeys: [], finishKeys: [] };
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body);
    if (path === '/api/trips') {
      requests.trip.push(body);
      return requests.trip.length === 1 ? new Response(JSON.stringify({ error: 'ENGINE_UNAVAILABLE' }), { status: 503 }) : new Response(JSON.stringify({ tripId: 'server-trip', clientTripId: body.clientTripId }), { status: 201 });
    }
    if (path === '/api/trips/server-trip/points') {
      requests.points.push(body);
      requests.pointKeys.push(options.headers['X-Trip-Key']);
      return requests.points.length === 1 ? new Response(JSON.stringify({ pointsReceived: 0, pointsStored: 0 }), { status: 200 }) : new Response(JSON.stringify({ pointsReceived: body.points.length, pointsStored: 0 }), { status: 200 });
    }
    requests.finish.push(body);
    requests.finishKeys.push(options.headers['X-Trip-Key']);
    if (requests.finish.length === 1) throw new TypeError('response lost');
    return new Response(null, { status: 204 });
  };

  try {
    const origin = { lat: 37.263, lng: 127.028 };
    const destination = { lat: 37.271, lng: 127.026 };
    const trip = await createTrip('route-id', origin, destination, 'BASELINE', 1724, 18400, { tmapEtaSeconds: 1860, tmapDistanceMeters: 18400 });
    const point = { timestamp: 1760000001000, latitude: origin.lat, longitude: origin.lng, accuracy: 6.2, speed: 14.8, heading: 132.4 };
    await recordPoint(trip.localId, point);
    const pointId = (await gpsStore.getPoints())[0].id;
    assert.equal((await gpsStore.getTrip(trip.localId)).clientTripId, trip.clientTripId);
    assert.equal((await gpsStore.getTrip(trip.localId)).algorithm, 'BASELINE');

    network.onLine = true;
    await syncTrips();
    assert.equal((await gpsStore.getTrip(trip.localId)).serverId, null);
    await syncTrips();
    assert.equal((await gpsStore.getTrip(trip.localId)).serverId, 'server-trip');
    assert.equal((await gpsStore.getPoints())[0].synced, false);
    await syncTrips();
    assert.equal((await gpsStore.getPoints())[0].synced, true);
    assert.equal(requests.trip[0].clientTripId, trip.clientTripId);
    assert.equal(requests.trip[1].clientTripId, trip.clientTripId);
    assert.equal(requests.trip[1].accessKey, trip.accessKey);
    assert.equal(trip.accessKey.length, 43);
    assert.equal(requests.trip[1].ourEtaSeconds, 1724);
    assert.equal(requests.trip[0].tmapEtaSeconds, 1860);
    assert.equal(requests.trip[1].tmapEtaSeconds, 1860);
    assert.equal(requests.trip[1].tmapDistanceMeters, 18400);
    assert.equal((await gpsStore.getTrip(trip.localId)).ourDistanceMeters, 18400);
    assert.equal(requests.points[0].points[0].pointId, pointId);
    assert.equal(requests.points[1].points[0].pointId, pointId);
    assert.equal(requests.points[1].points[0].gpsSpeed, 14.8);
    assert.deepEqual(requests.pointKeys, [trip.accessKey, trip.accessKey]);

    network.onLine = false;
    const finished = await finishTrip(trip);
    assert.equal((await gpsStore.getTrip(trip.localId)).finishedAt, finished.finishedAt);
    network.onLine = true;
    await syncTrips();
    assert.equal((await gpsStore.getTrip(trip.localId)).syncedFinish, false);
    await syncTrips();
    assert.equal((await gpsStore.getTrip(trip.localId)).syncedFinish, true);
    assert.deepEqual(requests.finish[0], requests.finish[1]);
    assert.deepEqual(requests.finishKeys, [trip.accessKey, trip.accessKey]);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
  }
});

test('finishing while server creation is pending preserves finishedAt', async () => {
  const previousFetch = globalThis.fetch;
  const previousNavigator = globalThis.navigator;
  const network = { onLine: false };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network });
  let completeTripRequest;
  let tripRequestStarted;
  let tripRequestBody;
  const started = new Promise((resolve) => { tripRequestStarted = resolve; });
  globalThis.fetch = async (path, options) => {
    if (path === '/api/trips') {
      tripRequestBody = JSON.parse(options.body);
      tripRequestStarted();
      return new Promise((resolve) => { completeTripRequest = resolve; });
    }
    return new Response(null, { status: 204 });
  };
  try {
    const origin = { lat: 37, lng: 127 };
    const trip = await createTrip('concurrent-route', origin, origin, 'DIRECTION_AWARE', 0, 0, { tmapEtaSeconds: null, tmapDistanceMeters: null });
    network.onLine = true;
    const synchronizing = syncTrips();
    await started;
    const finished = await finishTrip(trip);
    completeTripRequest(new Response(JSON.stringify({ tripId: 'concurrent-server-trip', clientTripId: trip.clientTripId }), { status: 201 }));
    await synchronizing;
    const saved = await gpsStore.getTrip(trip.localId);
    assert.equal(saved.finishedAt, finished.finishedAt);
    assert.equal(saved.serverId, 'concurrent-server-trip');
    assert.equal(saved.syncedFinish, true);
    assert.equal(tripRequestBody.tmapEtaSeconds, null);
    assert.equal(tripRequestBody.tmapDistanceMeters, null);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
  }
});

test('a mismatched trip echo never links the local trip to a server ID', async () => {
  const previousFetch = globalThis.fetch;
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  globalThis.fetch = async () => new Response(JSON.stringify({ tripId: 'wrong-server-trip', clientTripId: 'different-client-trip' }), { status: 201 });
  try {
    const origin = { lat: 37, lng: 127 };
    const trip = await createTrip('echo-route', origin, origin, 'DIRECTION_AWARE', 0, 0, { tmapEtaSeconds: null, tmapDistanceMeters: null });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await syncTrips();
    const stored = await gpsStore.getTrip(trip.localId);
    assert.equal(stored.serverId, null);
    assert.equal(stored.syncedStart, false);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
  }
});
