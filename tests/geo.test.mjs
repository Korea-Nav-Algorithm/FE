import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceToRouteMeters, haversineMeters, speedKmh, speedMetersPerSecond } from '../src/features/navigation/services/geo.ts';

test('Haversine computes a metre scale distance', () => {
  const distance = haversineMeters({ lat: 37, lng: 127 }, { lat: 37.001, lng: 127 });
  assert.ok(distance > 110 && distance < 112);
});

test('missing GPS speed falls back to point separation and elapsed time', () => {
  const previous = { timestamp: 1000, latitude: 37, longitude: 127, accuracy: 5, speed: null, heading: null };
  const current = { ...previous, timestamp: 2000, latitude: 37.0001 };
  assert.ok(speedKmh(current, previous) > 39);
  assert.ok(speedMetersPerSecond(current, previous) > 11);
  assert.ok(Math.abs(speedKmh(current, previous) - speedMetersPerSecond(current, previous) * 3.6) < 0.0001);
  assert.equal(speedKmh(current, null), null);
});

test('route deviation uses the closest line segment', () => {
  const route = [{ lat: 37, lng: 127 }, { lat: 37.001, lng: 127 }];
  assert.ok(distanceToRouteMeters({ lat: 37.0005, lng: 127.0001 }, route) < 10);
  assert.ok(distanceToRouteMeters({ lat: 37.0005, lng: 127.002 }, route) > 100);
});
