import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection, LineString } from 'geojson';
import { NavigationIcon } from './NavigationIcon';
import { MAP_CONFIG } from '../services/config';
import { trafficLabels, trafficRouteGeoJson } from '../services/routeTraffic';
import type { Coordinate, GpsPoint, RouteResult } from '../types/navigation';

interface Props { point: GpsPoint | null; destination: Coordinate | null; route: RouteResult | null; follow: boolean; driving: boolean; debug: boolean; bottomInset: number; onPick: (coordinate: Coordinate) => void; onUserMove: () => void; onRecenter: () => void }
const routeSourceId = 'navigation-route';
const segmentSourceId = 'traffic-segments';

// MapLibre 6 cannot infer the worker asset URL after Vite prebundles its ESM entry.
maplibregl.setWorkerUrl(workerUrl);

function routeGeoJson(route: RouteResult | null): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: route && route.geometry.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.geometry.map(({ lng, lat }) => [lng, lat]) } }] : [] };
}


/** Reserve the visible dock and guidance area when fitting route bounds. */
function viewportPadding(map: MapLibreMap, bottomInset: number, driving: boolean) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  if (width >= 900) return { top: 40, bottom: 48, left: 450, right: 80 };
  const top = driving ? 160 : 190;
  return { top: Math.min(top, height * 0.25), bottom: Math.min(bottomInset + 32, height * 0.48), left: 32, right: 72 };
}

/** Owns MapLibre lifecycle; inputs are plain navigation data from the hook. */
export function NavigationMap({ point, destination, route, follow, driving, debug, bottomInset, onPick, onUserMove, onRecenter }: Props) {
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
    map.on('error', () => setMapError(true));
    map.on('load', () => {
      map.addSource(routeSourceId, { type: 'geojson', data: routeGeoJson(null) });
      map.addLayer({ id: 'route-casing', type: 'line', source: routeSourceId, paint: { 'line-color': '#ffffff', 'line-width': 13, 'line-opacity': 0.95 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      map.addLayer({ id: 'route-line', type: 'line', source: routeSourceId, paint: { 'line-color': '#7b8d98', 'line-width': 9 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      map.addSource(segmentSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'traffic-segment-line', type: 'line', source: segmentSourceId,
        paint: { 'line-color': ['match', ['get', 'trafficLevel'], 'CONGESTED', '#db514b', 'SLOW', '#efa533', 'FREE', '#28a775', '#7b8d98'], 'line-width': 9 },
        layout: { 'line-join': 'round', 'line-cap': 'round' } });
      const canvas = document.createElement('canvas');
      canvas.width = 24; canvas.height = 24;
      const context = canvas.getContext('2d');
      if (context) {
        context.strokeStyle = '#ffffff'; context.lineWidth = 3;
        context.lineCap = 'round'; context.lineJoin = 'round';
        context.beginPath(); context.moveTo(7, 16); context.lineTo(12, 10); context.lineTo(17, 16); context.stroke();
        map.addImage('route-chevron', context.getImageData(0, 0, 24, 24), { pixelRatio: 2 });
        map.addLayer({ id: 'route-direction', type: 'symbol', source: routeSourceId,
          layout: { 'symbol-placement': 'line', 'symbol-spacing': 85, 'icon-image': 'route-chevron', 'icon-rotation-alignment': 'map', 'icon-rotate': 90, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      }
    });
    map.on('click', 'traffic-segment-line', (event) => {
      if (!debugRef.current) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const properties = feature.properties;
      const popup = document.createElement('div');
      [['구간', properties.edgeId], ['교통', trafficLabels[properties.trafficLevel as keyof typeof trafficLabels] ?? '정보 없음'], ['관측 속도', properties.trafficLevel === 'UNKNOWN' ? null : properties.observedSpeed], ['기준 속도', properties.baseSpeed], ['귀속 비율', properties.attribution], ['유효 속도', properties.effectiveSpeed]].forEach(([label, value]) => {
        const line = document.createElement('div'); line.textContent = `${label}: ${value ?? 'N/A'}`; popup.append(line);
      });
      new maplibregl.Popup({ closeButton: true }).setLngLat(event.lngLat).setDOMContent(popup).addTo(map);
    });
    map.on('click', (event) => {
      if (debugRef.current && map.getLayer('traffic-segment-line') && map.queryRenderedFeatures(event.point, { layers: ['traffic-segment-line'] }).length) return;
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
        map.fitBounds(bounds, { padding: viewportPadding(map, bottomInset, driving), pitch: 0, bearing: 0, maxZoom: 16, duration: 700 });
      }
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [route, driving, bottomInset]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      (map.getSource(segmentSourceId) as GeoJSONSource | undefined)?.setData(trafficRouteGeoJson(route));
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    if (!currentMarkerRef.current) {
      const element = document.createElement('div'); element.className = 'current-marker'; element.setAttribute('aria-label', '현재 위치');
      currentMarkerRef.current = new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).addTo(map);
      if (!route) map.flyTo({ center: [point.longitude, point.latitude], zoom: MAP_CONFIG.initialZoom, duration: 700 });
    } else currentMarkerRef.current.setLngLat([point.longitude, point.latitude]);
    const heading = point.accuracy !== null && point.accuracy <= 30 && point.heading !== null && point.heading >= 0 ? point.heading : 0;
    currentMarkerRef.current.setRotationAlignment('map').setRotation(heading);
    if (follow && driving) map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), 16), pitch: 35, padding: { top: 0, bottom: 0, left: 0, right: 0 }, offset: [0, Math.max(0, (map.getContainer().clientHeight - bottomInset) * 0.15 - bottomInset / 2)], bearing: heading, duration: 650 });
  }, [point, follow, driving, route, bottomInset]);

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
    onUserMove();
    const bounds = new maplibregl.LngLatBounds(); route.geometry.forEach(({ lng, lat }) => bounds.extend([lng, lat]));
    const map = mapRef.current;
    if (map) map.fitBounds(bounds, { padding: viewportPadding(map, bottomInset, driving), pitch: 0, bearing: 0, maxZoom: 16, duration: 600 });
  };

  return <>
    <div className="map" ref={containerRef} aria-label="내비게이션 지도" />
    {mapError && <div className="map-error">지도를 불러오지 못했습니다. 네트워크와 지도 스타일 URL을 확인해주세요.</div>}
    <div className="map-actions" aria-label="지도 조작">
      <div className="zoom-controls"><button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="지도 확대"><NavigationIcon name="plus" /></button><button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="지도 축소"><NavigationIcon name="minus" /></button></div>
      {route && <button type="button" onClick={fitRoute} aria-label="경로 전체 보기" title="경로 전체 보기"><NavigationIcon name="expand" /></button>}
      <button className={follow ? 'is-following' : ''} type="button" onClick={recenter} aria-pressed={follow} aria-label="현재 위치로 이동" title="현재 위치로 이동"><NavigationIcon name="locate" /></button>
    </div>
  </>;
}
