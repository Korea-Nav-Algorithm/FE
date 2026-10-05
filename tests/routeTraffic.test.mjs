import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficRouteGeoJson, trafficSummary } from '../src/features/navigation/services/routeTraffic.ts';

const geometry = [{ lat: 37, lng: 127 }, { lat: 37.0005, lng: 127 },
  { lat: 37.001, lng: 127 }, { lat: 37.002, lng: 127 }];
const route = { routeId: 'test', algorithm: 'BASELINE', algorithmVersion: 'v1', distanceMeters: 300,
  durationSeconds: 30, geometry, trafficSource: 'JSON', segments: [
    { edgeId: 'slow', observedSpeed: 15, baseSpeed: 50, attribution: 1, effectiveSpeed: 15,
      trafficLevel: 'CONGESTED', geometryStartIndex: 0, geometryEndIndex: 2 },
    { edgeId: 'unknown', observedSpeed: 50, baseSpeed: 50, attribution: 1, effectiveSpeed: 37.5,
      trafficLevel: 'UNKNOWN', geometryStartIndex: 2, geometryEndIndex: 3 },
  ] };

test('traffic line follows each edge geometry and does not color missing observations green', () => {
  const features = trafficRouteGeoJson(route).features;
  assert.equal(features.length, 3);
  assert.deepEqual(features[0].geometry.coordinates, [[127, 37], [127, 37.0005]]);
  assert.deepEqual(features[1].geometry.coordinates, [[127, 37.0005], [127, 37.001]]);
  assert.equal(features[0].properties.trafficLevel, 'CONGESTED');
  assert.equal(features[1].properties.trafficLevel, 'CONGESTED');
  assert.equal(features[2].properties.trafficLevel, 'UNKNOWN');
  assert.match(trafficSummary(route), /개발용 JSON 교통 데이터/);
  assert.match(trafficSummary(route), /1\/2구간 관측/);
});

test('legacy route without geometry ranges remains visible as unknown traffic', () => {
  const old = { ...route, segments: [{ ...route.segments[0], geometryStartIndex: undefined, geometryEndIndex: undefined }] };
  const features = trafficRouteGeoJson(old).features;
  assert.equal(features.length, 1);
  assert.equal(features[0].properties.trafficLevel, 'UNKNOWN');
});

test('unknown source never presents a free segment as observed traffic', () => {
  const unknown = { ...route, trafficSource: 'UNKNOWN', segments: [
    { ...route.segments[0], trafficLevel: 'FREE' }, route.segments[1],
  ] };
  assert.ok(trafficRouteGeoJson(unknown).features.every((feature) => feature.properties.trafficLevel === 'UNKNOWN'));
  assert.equal(trafficSummary(unknown), '실시간 교통 미반영 · 기본 속도 기준 예상시간');
});

test('zero observations, including a JSON development route, disclose baseline ETA', () => {
  const unobserved = { ...route, segments: route.segments.map((segment) => ({ ...segment, trafficLevel: 'UNKNOWN' })) };
  assert.match(trafficSummary(unobserved), /실시간 교통 미반영 · 기본 속도 기준 예상시간/);
  assert.match(trafficSummary(unobserved), /개발용 JSON 데이터/);
});

test('unmapped and overlapping geometry legs remain gray while mapped legs retain their level', () => {
  const gap = { ...route, segments: [{ ...route.segments[0], geometryEndIndex: 1 },
    { ...route.segments[1], geometryStartIndex: 2 }] };
  assert.deepEqual(trafficRouteGeoJson(gap).features.map((feature) => feature.properties.trafficLevel),
    ['CONGESTED', 'UNKNOWN', 'UNKNOWN']);
  const overlap = { ...route, segments: [{ ...route.segments[0], geometryEndIndex: 2 },
    { ...route.segments[1], trafficLevel: 'FREE', geometryStartIndex: 1 }] };
  assert.deepEqual(trafficRouteGeoJson(overlap).features.map((feature) => feature.properties.trafficLevel),
    ['CONGESTED', 'UNKNOWN', 'FREE']);
});
