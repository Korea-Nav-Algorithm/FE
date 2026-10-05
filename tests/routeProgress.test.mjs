import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRouteProgress, remainingRouteSeconds, upcomingInstruction } from '../src/features/navigation/services/routeProgress.ts';

const route = [{ lat: 37, lng: 127 }, { lat: 37.001, lng: 127 }, { lat: 37.001, lng: 127.001 }];

test('mid-edge GPS projects to continuous route progress', () => {
  const progress = projectRouteProgress({ lat: 37.0005, lng: 127.00002 }, route, null);
  assert.ok(progress.alongMeters > 50 && progress.alongMeters < 62);
  assert.ok(progress.distanceFromRouteMeters < 3);
  assert.ok(progress.totalMeters > 195 && progress.totalMeters < 205);
});

test('progress prefers forward leg where a route doubles back close to itself', () => {
  const loop = [{ lat: 37, lng: 127 }, { lat: 37.001, lng: 127 },
    { lat: 37.001, lng: 127.0001 }, { lat: 37, lng: 127.0001 }];
  const progress = projectRouteProgress({ lat: 37.0005, lng: 127.00008 }, loop, 160);
  assert.ok(progress.alongMeters > 160);
});

test('next instruction uses route distance instead of vertex index', () => {
  const instructions = [
    { type: 'START', geometryIndex: 0, distanceFromStartMeters: 0, roadName: '', coordinate: route[0] },
    { type: 'TURN_RIGHT', geometryIndex: 1, distanceFromStartMeters: 111, roadName: 'Road', coordinate: route[1] },
    { type: 'ARRIVE', geometryIndex: 2, distanceFromStartMeters: 200, roadName: '', coordinate: route[2] },
  ];
  const next = upcomingInstruction({ instructions }, 60);
  assert.equal(next.instruction.type, 'TURN_RIGHT');
  assert.equal(next.distanceMeters, 51);
  assert.equal(upcomingInstruction({ instructions }, 130).instruction.type, 'ARRIVE');
});

test('remaining ETA reflects a slow downstream segment', () => {
  const estimatedRoute = { geometry: route, durationSeconds: 100, segments: [
    { effectiveSpeed: 100 }, { effectiveSpeed: 10 },
  ] };
  const firstLeg = projectRouteProgress(route[1], route, null).alongMeters;
  const remaining = remainingRouteSeconds(estimatedRoute, firstLeg);
  assert.ok(remaining > 80 && remaining < 95);
  assert.equal(remainingRouteSeconds(estimatedRoute, 0), 100);
  assert.equal(remainingRouteSeconds(estimatedRoute, 1000), 0);
});

test('remaining ETA falls back to distance ratio when segments do not align with geometry', () => {
  const estimatedRoute = { geometry: route, durationSeconds: 100, segments: [] };
  const firstLeg = projectRouteProgress(route[1], route, null).alongMeters;
  const remaining = remainingRouteSeconds(estimatedRoute, firstLeg);
  assert.ok(remaining > 40 && remaining < 50);
});

test('remaining ETA uses effective speed across multi-point edge geometry ranges', () => {
  const geometry = [{ lat: 37, lng: 127 }, { lat: 37.0005, lng: 127 },
    { lat: 37.001, lng: 127 }, { lat: 37.002, lng: 127 }];
  const estimatedRoute = { geometry, durationSeconds: 120, segments: [
    { effectiveSpeed: 60, geometryStartIndex: 0, geometryEndIndex: 2 },
    { effectiveSpeed: 10, geometryStartIndex: 2, geometryEndIndex: 3 },
  ] };
  const firstEdgeEnd = projectRouteProgress(geometry[2], geometry, null).alongMeters;
  assert.ok(remainingRouteSeconds(estimatedRoute, firstEdgeEnd) > 95);
  assert.equal(remainingRouteSeconds(estimatedRoute, 0), 120);
  assert.equal(remainingRouteSeconds(estimatedRoute, 1000), 0);
});

test('invalid or incomplete geometry mapping falls back to overall route distance', () => {
  const estimatedRoute = { geometry: route, durationSeconds: 100, segments: [
    { effectiveSpeed: 60, geometryStartIndex: 0, geometryEndIndex: 1 },
    { effectiveSpeed: 10, geometryStartIndex: 0, geometryEndIndex: 1 },
  ] };
  const firstLeg = projectRouteProgress(route[1], route, null).alongMeters;
  const remaining = remainingRouteSeconds(estimatedRoute, firstLeg);
  assert.ok(remaining > 40 && remaining < 50);
});
