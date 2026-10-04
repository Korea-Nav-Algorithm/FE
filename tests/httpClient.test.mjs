import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, postJson } from '../src/features/navigation/services/httpClient.ts';
import { ApiRouteProvider } from '../src/features/navigation/services/providers.ts';

test('uses same-origin /api and accepts empty 204 finish response', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/trips/server-trip/finish');
    assert.equal(JSON.parse(init.body).actualDurationSeconds, 1801);
    return new Response(null, { status: 204 });
  };
  try { assert.equal(await postJson('/trips/server-trip/finish', { finishedAt: 1801000, actualDurationSeconds: 1801 }), undefined); }
  finally { globalThis.fetch = previousFetch; }
});

test('preserves Backend string error status and code', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'ENGINE_UNAVAILABLE' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  try { await assert.rejects(postJson('/routes', {}), (error) => error instanceof ApiError && error.status === 503 && error.code === 'ENGINE_UNAVAILABLE'); }
  finally { globalThis.fetch = previousFetch; }
});

test('BASELINE route request keeps the selected algorithm', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/routes');
    assert.equal(JSON.parse(init.body).algorithm, 'BASELINE');
    return new Response(JSON.stringify({ routeId: 'baseline-route', algorithm: 'BASELINE', algorithmVersion: 'v1', geometry: [{ lat: 37, lng: 127 }], distanceMeters: 0, durationSeconds: 0, segments: [] }), { status: 200 });
  };
  try { assert.equal((await new ApiRouteProvider().getRoute({ lat: 37, lng: 127 }, { lat: 37, lng: 127 }, 'BASELINE')).routeId, 'baseline-route'); }
  finally { globalThis.fetch = previousFetch; }
});

test('restores a saved route by ID with GET', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/routes/saved-route');
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    return new Response(JSON.stringify({ routeId: 'saved-route', algorithm: 'DIRECTION_AWARE', algorithmVersion: 'v1', geometry: [{ lat: 37, lng: 127 }], distanceMeters: 0, durationSeconds: 0, segments: [] }), { status: 200 });
  };
  try { assert.equal((await new ApiRouteProvider().getSavedRoute('saved-route')).routeId, 'saved-route'); }
  finally { globalThis.fetch = previousFetch; }
});

test('handles non-JSON 413 without assuming a structured error', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Payload Too Large', { status: 413 });
  try { await assert.rejects(postJson('/trips/id/points', { points: [{}] }), (error) => error instanceof ApiError && error.status === 413 && error.code === null); }
  finally { globalThis.fetch = previousFetch; }
});
