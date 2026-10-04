import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { MAP_CONFIG } from '../services/config';
import type { Coordinate, GpsPoint, RouteResult } from '../types/navigation';

interface Props { point: GpsPoint | null; destination: Coordinate | null; route: RouteResult | null; follow: boolean; driving: boolean; debug: boolean; onPick: (coordinate: Coordinate) => void; onUserMove: () => void; onRecenter: () => void }
const routeSourceId = 'navigation-route';
const segmentSourceId = 'debug-segments';

function routeGeoJson(route: RouteResult | null): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: route && route.geometry.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.geometry.map(({ lng, lat }) => [lng, lat]) } }] : [] };
}

/** Owns MapLibre lifecycle; inputs are plain navigation data from the hook. */
export function NavigationMap({ point, destination, route, follow, driving, debug, onPick, onUserMove, onRecenter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const currentMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destinationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPick);
  const onUserMoveRef = useRef(onUserMove);
  const debugRef = useRef(debug);
  const [mapError, setMapError] = useState(false);
  onPickRef.current = onPick;
  onUserMoveRef.current = onUserMove;
  debugRef.current = debug;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: MAP_CONFIG.styleUrl, center: [127.13973, 37.37709], zoom: MAP_CONFIG.initialZoom, attributionControl: { compact: true } });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('error', () => setMapError(true));
    map.on('load', () => {
      map.addSource(routeSourceId, { type: 'geojson', data: routeGeoJson(null) });
      map.addLayer({ id: 'route-casing', type: 'line', source: routeSourceId, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.95 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      map.addLayer({ id: 'route-line', type: 'line', source: routeSourceId, paint: { 'line-color': '#2369e8', 'line-width': 6 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      map.addSource(segmentSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'debug-segment-line', type: 'line', source: segmentSourceId, paint: { 'line-color': ['interpolate', ['linear'], ['coalesce', ['get', 'attribution'], 0], 0, '#2cad80', 0.5, '#f5bc42', 1, '#e85d4e'], 'line-width': 9, 'line-opacity': 0.8 }, layout: { visibility: 'none', 'line-cap': 'round' } });
    });
    map.on('click', 'debug-segment-line', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const properties = feature.properties;
      const popup = document.createElement('div');
      [['edge', properties.edgeId], ['observed', properties.observedSpeed], ['base', properties.baseSpeed], ['attribution', properties.attribution], ['effective', properties.effectiveSpeed]].forEach(([label, value]) => {
        const line = document.createElement('div'); line.textContent = `${label}: ${value ?? 'N/A'}`; popup.append(line);
      });
      new maplibregl.Popup({ closeButton: true }).setLngLat(event.lngLat).setDOMContent(popup).addTo(map);
    });
    map.on('click', (event) => {
      if (debugRef.current && map.getLayer('debug-segment-line') && map.queryRenderedFeatures(event.point, { layers: ['debug-segment-line'] }).length) return;
      onPickRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    map.on('dragstart', () => onUserMoveRef.current());
    map.on('zoomstart', (event) => { if (event.originalEvent) onUserMoveRef.current(); });
    return () => { currentMarkerRef.current?.remove(); destinationMarkerRef.current?.remove(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      (map.getSource(routeSourceId) as GeoJSONSource | undefined)?.setData(routeGeoJson(route));
      if (route && route.geometry.length >= 2 && !driving) {
        const bounds = new maplibregl.LngLatBounds();
        route.geometry.forEach(({ lng, lat }) => bounds.extend([lng, lat]));
        map.fitBounds(bounds, { padding: { top: 130, bottom: 310, left: 60, right: 60 }, maxZoom: 16, duration: 700 });
      }
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [route, driving]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const aligned = !!route?.segments && route.segments.length === route.geometry.length - 1;
      const features: Feature<LineString>[] = debug && aligned && route?.segments ? route.segments.map((segment, index) => ({ type: 'Feature', properties: { ...segment }, geometry: { type: 'LineString', coordinates: route.geometry.slice(index, index + 2).map(({ lng, lat }) => [lng, lat]) } })) : [];
      (map.getSource(segmentSourceId) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
      if (map.getLayer('debug-segment-line')) map.setLayoutProperty('debug-segment-line', 'visibility', features.length ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [route, debug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    if (!currentMarkerRef.current) {
      const element = document.createElement('div'); element.className = 'current-marker'; element.setAttribute('aria-label', '현재 위치');
      currentMarkerRef.current = new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).addTo(map);
      if (!route) map.flyTo({ center: [point.longitude, point.latitude], zoom: MAP_CONFIG.initialZoom, duration: 700 });
    } else currentMarkerRef.current.setLngLat([point.longitude, point.latitude]);
    if (follow && driving) map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), 15), bearing: point.accuracy !== null && point.accuracy <= 30 && point.heading !== null && point.heading >= 0 ? point.heading : 0, duration: 650 });
  }, [point, follow, driving, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    destinationMarkerRef.current?.remove();
    if (destination) {
      const element = document.createElement('div'); element.className = 'destination-marker'; element.textContent = '⌖'; element.setAttribute('aria-label', '목적지');
      destinationMarkerRef.current = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([destination.lng, destination.lat]).addTo(map);
    }
  }, [destination]);

  const recenter = () => { onRecenter(); if (point) mapRef.current?.flyTo({ center: [point.longitude, point.latitude], zoom: 16, duration: 600 }); };
  const fitRoute = () => {
    if (!route?.geometry.length) return;
    const bounds = new maplibregl.LngLatBounds(); route.geometry.forEach(({ lng, lat }) => bounds.extend([lng, lat]));
    mapRef.current?.fitBounds(bounds, { padding: { top: 130, bottom: 310, left: 60, right: 60 }, maxZoom: 16, duration: 600 });
  };

  return <>
    <div className="map" ref={containerRef} aria-label="내비게이션 지도" />
    {mapError && <div className="map-error">지도를 불러오지 못했습니다. 네트워크와 지도 스타일 URL을 확인해주세요.</div>}
    <div className="map-actions">
      {route && <button type="button" onClick={fitRoute} aria-label="경로 전체 보기" title="경로 전체 보기">⤢</button>}
      <button type="button" onClick={recenter} aria-label="현재 위치로 이동" title="현재 위치로 이동">◎</button>
    </div>
    {debug && route?.segments?.length ? <div className="segment-hint">{route.segments.length === route.geometry.length - 1 ? '색상 구간을 눌러 속성 확인' : '구간-좌표 매핑이 없어 선 시각화 불가'}</div> : null}
  </>;
}
