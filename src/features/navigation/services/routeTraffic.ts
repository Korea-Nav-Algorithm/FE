import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { Coordinate, RouteResult, RouteSegment, TrafficLevel } from '../types/navigation';

function line(coordinates: Coordinate[], properties: Record<string, string | number>): Feature<LineString> {
  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates: coordinates.map(({ lng, lat }) => [lng, lat]) } };
}

/** Segment geometry indices are provided by Engine because one edge may contain many points. */
export function trafficRouteGeoJson(route: RouteResult | null): FeatureCollection<LineString> {
  if (!route || route.geometry.length < 2) return { type: 'FeatureCollection', features: [] };
  const owners: Array<RouteSegment | null> = Array(route.geometry.length - 1).fill(null);
  const overlapping = new Set<number>();
  for (let index = 0; index < route.segments.length; index++) {
    const segment = route.segments[index];
    const start = segment.geometryStartIndex;
    const end = segment.geometryEndIndex;
    if (start == null || end == null || !Number.isInteger(start) || !Number.isInteger(end)
      || start < 0 || end <= start || end >= route.geometry.length) {
      return { type: 'FeatureCollection', features: [line(route.geometry, { trafficLevel: 'UNKNOWN' })] };
    }
    for (let leg = start; leg < end; leg++) {
      if (owners[leg]) overlapping.add(leg);
      else owners[leg] = segment;
    }
  }
  const features = owners.map((segment, leg) => {
    const trafficLevel = route.trafficSource === 'UNKNOWN' || !route.trafficSource || overlapping.has(leg)
      ? 'UNKNOWN' : segment?.trafficLevel ?? 'UNKNOWN';
    return line(route.geometry.slice(leg, leg + 2), {
      ...(segment && !overlapping.has(leg) ? { edgeId: segment.edgeId, observedSpeed: segment.observedSpeed,
        baseSpeed: segment.baseSpeed, attribution: segment.attribution, effectiveSpeed: segment.effectiveSpeed } : {}),
      trafficLevel,
    });
  });
  return { type: 'FeatureCollection', features };
}

/** Unknown speeds stay distinct from genuinely observed free-flow traffic. */
export function trafficSummary(route: RouteResult | null): string | null {
  if (!route) return null;
  const observed = route.segments.filter((segment: RouteSegment) => segment.trafficLevel && segment.trafficLevel !== 'UNKNOWN').length;
  const source = route.trafficSource === 'JSON' ? '개발용 JSON 교통 데이터' : '경기 교통 데이터';
  if (route.trafficSource === 'UNKNOWN' || !route.trafficSource || observed === 0) {
    return `실시간 교통 미반영 · 기본 속도 기준 예상시간${route.trafficSource === 'JSON' ? ' · 개발용 JSON 데이터' : ''}`;
  }
  if (observed < route.segments.length) return `${source} · ${observed}/${route.segments.length}구간 관측 · 나머지 기본 속도 기준`;
  return `${source} · ${observed}구간 관측`;
}

export const trafficLabels: Record<TrafficLevel, string> = {
  CONGESTED: '정체', SLOW: '서행', FREE: '원활', UNKNOWN: '정보 없음',
};
