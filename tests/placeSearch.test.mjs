import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPlaces, placeSearchErrorMessage } from '../src/features/navigation/services/placeSearch.ts';
import { ApiError } from '../src/features/navigation/services/httpClient.ts';

test('building search uses Edge, returns coordinates, and sends no API key', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/places?query=%EB%B6%84%EB%8B%B9%EC%A4%91%EC%95%99%EA%B5%90%ED%9A%8C');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, undefined);
    return new Response(JSON.stringify({ source: 'NAVER', places: [{ id: '123', name: '분당중앙교회',
      address: '효자길 39', coordinate: { lat: 37.37709, lng: 127.13973 } }] }), { status: 200 });
  };
  try {
    const response = await searchPlaces(' 분당중앙교회 ');
    assert.equal(response.places[0].coordinate.lng, 127.13973);
    assert.equal(response.source, 'NAVER');
  } finally { globalThis.fetch = previous; }
});

test('unavailable place search explains coordinate fallback', () => {
  assert.match(placeSearchErrorMessage(new ApiError(503, 'PLACE_SEARCH_UNAVAILABLE')), /지도나 좌표/);
});
