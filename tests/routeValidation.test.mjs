import test from 'node:test';
import assert from 'node:assert/strict';
import { isUsableRoute } from '../src/features/navigation/services/routeValidation.ts';

const origin = { lat: 37.263, lng: 127.028 };
const common = { algorithm: 'DIRECTION_AWARE', algorithmVersion: 'v1', segments: [] };

test('normal geometry with two coordinates is usable', () => {
  assert.equal(isUsableRoute({ ...common, routeId: 'normal', geometry: [origin, { lat: 37.264, lng: 127.027 }], distanceMeters: 120, durationSeconds: 20 }), true);
});

test('zero-distance graph match accepts one coordinate', () => {
  assert.equal(isUsableRoute({ ...common, routeId: 'zero', geometry: [origin], distanceMeters: 0, durationSeconds: 0 }), true);
});

test('incomplete geometry and inconsistent zero-distance data are rejected', () => {
  assert.equal(isUsableRoute({ ...common, routeId: 'empty', geometry: [], distanceMeters: 0, durationSeconds: 0 }), false);
  assert.equal(isUsableRoute({ ...common, routeId: 'invalid', geometry: [origin], distanceMeters: 40, durationSeconds: 0 }), false);
  assert.equal(isUsableRoute({ ...common, routeId: 'negative', geometry: [origin, origin], distanceMeters: -1, durationSeconds: 0 }), false);
  assert.equal(isUsableRoute({ ...common, routeId: 'outside', geometry: [origin, { lat: 100, lng: 127 }], distanceMeters: 120, durationSeconds: 20 }), false);
});
