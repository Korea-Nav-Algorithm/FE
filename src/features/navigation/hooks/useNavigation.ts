import { useCallback, useEffect, useRef, useState } from 'react';
import { useScreenWakeLock } from './useScreenWakeLock';
import { NAVIGATION_CONFIG } from '../services/config';
import { watchLocation } from '../services/geolocation';
import { coordinateOf, haversineMeters, speedMetersPerSecond } from '../services/geo';
import { projectRouteProgress, remainingRouteSeconds, upcomingInstruction } from '../services/routeProgress';
import { gpsStore } from '../services/gpsStore';
import { mockMode, restoreRoute, routeProvider } from '../services/providers';
import { parseManualBenchmark } from '../services/manualBenchmark';
import { createTrip, finishTrip, recordPoint, recordReroute, subscribeSyncDiagnostics, syncTrips, type SyncDiagnostics } from '../services/tripSync';
import { isUsableRoute } from '../services/routeValidation';
import { ApiError, routeErrorMessage } from '../services/httpClient';
import type { Coordinate, GpsPoint, NavigationState, RouteResult, RoutingAlgorithm, StoredTrip } from '../types/navigation';

export function useNavigation() {
  const [state, setState] = useState<NavigationState>('LOCATING');
  const [point, setPoint] = useState<GpsPoint | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [destinationName, setDestinationName] = useState('목적지 선택');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [algorithm, setAlgorithmState] = useState<RoutingAlgorithm>('DIRECTION_AWARE');
  const [routeAlgorithm, setRouteAlgorithm] = useState<RoutingAlgorithm | null>(null);
  const [benchmarkMinutes, setBenchmarkMinutes] = useState('');
  const [benchmarkKilometers, setBenchmarkKilometers] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remainingMeters, setRemainingMeters] = useState<number | null>(null);
  const [progressMeters, setProgressMeters] = useState(0);
  const [progressAlongGeometryMeters, setProgressAlongGeometryMeters] = useState(0);
  const [distanceFromRoute, setDistanceFromRoute] = useState<number | null>(null);
  const [offRouteCount, setOffRouteCount] = useState(0);
  const [rerouteCount, setRerouteCount] = useState(0);
  const [lastTrip, setLastTrip] = useState<StoredTrip | null>(null);
  const [routeApiStatus, setRouteApiStatus] = useState('IDLE');
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnostics>({ trip: 'IDLE', points: 'IDLE', routes: 'IDLE', finish: 'IDLE' });
  const tripRef = useRef<StoredTrip | null>(null);
  const pointRef = useRef<GpsPoint | null>(null);
  const previousPointRef = useRef<GpsPoint | null>(null);
  const lastRecordedRef = useRef(0);
  const pointWriteRef = useRef<Promise<void>>(Promise.resolve());
  const deviationCountRef = useRef(0);
  const arrivalSinceRef = useRef<number | null>(null);
  const reroutingRef = useRef(false);
  const routeRequestIdRef = useRef(0);
  const algorithmRef = useRef<RoutingAlgorithm>('DIRECTION_AWARE');
  const routeRef = useRef<RouteResult | null>(null);
  const geometryProgressRef = useRef<number | null>(null);
  const destinationRef = useRef<Coordinate | null>(null);
  const stateRef = useRef<NavigationState>('LOCATING');

  const changeState = useCallback((next: NavigationState) => { stateRef.current = next; setState(next); }, []);
  const refreshCounts = useCallback(async () => {
    try {
      const points = await gpsStore.getPoints();
      setPendingCount(points.filter(({ synced }) => !synced).length);
      setTotalPoints(points.length);
      if (tripRef.current) {
        const current = await gpsStore.getTrip(tripRef.current.localId);
        if (current) { tripRef.current = current; setLastTrip(current); }
      }
    } catch { setError('기기 저장소를 사용할 수 없습니다. 주행 기록을 안전하게 저장할 수 없습니다.'); }
  }, []);

  const requestRoute = useCallback(async (target: Coordinate, name: string, origin?: Coordinate, isReroute = false, requestedAlgorithm?: RoutingAlgorithm) => {
    const requestId = ++routeRequestIdRef.current;
    const start = origin || (pointRef.current ? coordinateOf(pointRef.current) : null);
    if (!start) { setError('현재 위치를 확인한 뒤 경로를 계산할 수 있습니다.'); return; }
    setBusy(true);
    setError(null);
    setRouteApiStatus('PENDING');
    if (!isReroute) {
      if (destinationRef.current && (destinationRef.current.lat !== target.lat || destinationRef.current.lng !== target.lng)) {
        setBenchmarkMinutes('');
        setBenchmarkKilometers('');
      }
      destinationRef.current = target;
      setDestination(target);
      setDestinationName(name);
      routeRef.current = null;
      setRoute(null);
    }
    const selectedAlgorithm = requestedAlgorithm || algorithmRef.current;
    try {
      const result = await routeProvider.getRoute(start, target, selectedAlgorithm);
      if (requestId !== routeRequestIdRef.current) return;
      if (!isUsableRoute(result) || result.algorithm !== selectedAlgorithm) throw new Error('Invalid route response');
      if (isReroute && tripRef.current) await recordReroute(tripRef.current.localId, result.routeId);
      if (requestId !== routeRequestIdRef.current) return;
      routeRef.current = result;
      geometryProgressRef.current = null;
      setProgressMeters(0);
      setProgressAlongGeometryMeters(0);
      setRoute(result);
      setRouteAlgorithm(selectedAlgorithm);
      setRouteApiStatus('SUCCESS');
      destinationRef.current = target;
      setDestination(target);
      setDestinationName(name);
      setRemainingMeters(result.distanceMeters);
      if (!isReroute) changeState('ROUTE_READY');
    } catch (failure) {
      if (requestId === routeRequestIdRef.current) {
        setRouteApiStatus(failure instanceof ApiError ? `FAILED ${failure.status} ${failure.code || ''}`.trim() : 'FAILED');
        setError(routeErrorMessage(failure));
        if (!isReroute) changeState('ERROR');
      }
    }
    finally { if (requestId === routeRequestIdRef.current) setBusy(false); }
  }, [changeState]);

  const selectAlgorithm = useCallback((next: RoutingAlgorithm) => {
    algorithmRef.current = next;
    setAlgorithmState(next);
    if (destinationRef.current && stateRef.current !== 'DRIVING' && stateRef.current !== 'ARRIVED') void requestRoute(destinationRef.current, nameRef.current, undefined, false, next);
  }, [requestRoute]);

  const onGpsPoint = useCallback((next: GpsPoint) => {
    const previous = previousPointRef.current;
    pointRef.current = next;
    previousPointRef.current = next;
    setPoint(next);
    const speedMetresPerSecond = speedMetersPerSecond(next, previous);
    setSpeed(speedMetresPerSecond === null ? null : speedMetresPerSecond * 3.6);
    if (stateRef.current === 'LOCATING') changeState('IDLE');
    const trip = tripRef.current;
    const currentRoute = routeRef.current;
    const target = destinationRef.current;
    if (!trip || !['DRIVING', 'ARRIVED'].includes(stateRef.current)) return;

    if (next.timestamp - lastRecordedRef.current >= NAVIGATION_CONFIG.pointIntervalMilliseconds) {
      lastRecordedRef.current = next.timestamp;
      const recordedPoint = next.speed === null && speedMetresPerSecond !== null ? { ...next, speed: speedMetresPerSecond } : next;
      const write = pointWriteRef.current.then(() => recordPoint(trip.localId, recordedPoint));
      pointWriteRef.current = write.catch(() => setError('GPS 기록 저장에 실패했습니다. 저장 공간을 확인해주세요.'));
      void write.then(refreshCounts).catch(() => {});
    }
    if (!currentRoute || !target) return;
    const current = coordinateOf(next);
    const projection = projectRouteProgress(current, currentRoute.geometry, geometryProgressRef.current);
    const stableAlong = Math.max(0, Math.max((geometryProgressRef.current ?? 0) - 20, projection.alongMeters));
    geometryProgressRef.current = stableAlong;
    setProgressAlongGeometryMeters(stableAlong);
    const fraction = projection.totalMeters === 0 ? 1 : Math.min(1, stableAlong / projection.totalMeters);
    const traveledMeters = Math.round(currentRoute.distanceMeters * fraction);
    setProgressMeters(traveledMeters);
    setRemainingMeters(Math.max(0, currentRoute.distanceMeters - traveledMeters));
    setDistanceFromRoute(projection.distanceFromRouteMeters);
    const hasGoodAccuracy = next.accuracy !== null && next.accuracy <= NAVIGATION_CONFIG.poorAccuracyMeters;
    if (hasGoodAccuracy && stateRef.current === 'DRIVING') {
      if (projection.distanceFromRouteMeters > NAVIGATION_CONFIG.rerouteDistanceMeters) deviationCountRef.current++;
      else deviationCountRef.current = 0;
      setOffRouteCount(deviationCountRef.current);
      if (deviationCountRef.current >= NAVIGATION_CONFIG.rerouteConsecutivePoints && !reroutingRef.current) {
        reroutingRef.current = true;
        deviationCountRef.current = 0;
        setOffRouteCount(0);
        setRerouteCount((count) => count + 1);
        requestRoute(target, nameRef.current, current, true).finally(() => { reroutingRef.current = false; });
      }
      if (haversineMeters(current, target) <= NAVIGATION_CONFIG.arrivalDistanceMeters) {
        arrivalSinceRef.current ??= next.timestamp;
        if (next.timestamp - arrivalSinceRef.current >= NAVIGATION_CONFIG.arrivalHoldMilliseconds) changeState('ARRIVED');
      } else arrivalSinceRef.current = null;
    }
  }, [changeState, refreshCounts, requestRoute]);
  const nameRef = useRef(destinationName);
  nameRef.current = destinationName;

  useEffect(() => watchLocation(onGpsPoint, (message) => { setError(message); if (!pointRef.current) changeState('ERROR'); }), [onGpsPoint, changeState]);
  useEffect(() => subscribeSyncDiagnostics(setSyncDiagnostics), []);
  useEffect(() => {
    const updateNetwork = () => { setOnline(navigator.onLine); if (navigator.onLine) syncTrips().then(refreshCounts).catch(() => {}); };
    window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork);
    const timer = window.setInterval(() => { syncTrips().then(refreshCounts).catch(() => {}); }, 5000);
    syncTrips().then(refreshCounts).catch(() => {});
    return () => { window.removeEventListener('online', updateNetwork); window.removeEventListener('offline', updateNetwork); window.clearInterval(timer); };
  }, [refreshCounts]);
  useEffect(() => {
    gpsStore.getTrips().then((trips) => {
      const active = trips.filter((trip) => trip.finishedAt === null).sort((first, second) => second.startedAt - first.startedAt)[0];
      if (active) {
        tripRef.current = active;
        setLastTrip(active);
        algorithmRef.current = active.algorithm || 'DIRECTION_AWARE';
        setAlgorithmState(algorithmRef.current);
        destinationRef.current = active.destination;
        setDestination(active.destination);
        setDestinationName('이전 주행 목적지');
        changeState('DRIVING');
        setRouteApiStatus('PENDING');
        const currentRouteId = active.reroutes?.at(-1)?.routeId || active.routeId;
        restoreRoute(currentRouteId, active.origin, active.destination, algorithmRef.current).then((result) => { if (isUsableRoute(result) && (mockMode || result.routeId === currentRouteId) && (result.algorithm === null || result.algorithm === algorithmRef.current)) { routeRef.current = result; setRoute(result); setRouteAlgorithm(result.algorithm || algorithmRef.current); setRemainingMeters(result.distanceMeters); setRouteApiStatus('SUCCESS'); } else { setRouteApiStatus('FAILED'); setError('경로를 복원하지 못했습니다. GPS 기록은 계속 저장됩니다.'); } }).catch(() => { setRouteApiStatus('FAILED'); setError('경로를 복원하지 못했습니다. GPS 기록은 계속 저장됩니다.'); });
      }
    }).catch(() => {});
  }, [changeState]);

  const startDriving = useCallback(async () => {
    if (!route || !destination || !pointRef.current || busy) return;
    let benchmark;
    try { benchmark = parseManualBenchmark(benchmarkMinutes, benchmarkKilometers); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'TMAP 벤치마크 입력을 확인해주세요.'); return; }
    setBusy(true);
    try {
      const trip = await createTrip(route.routeId, coordinateOf(pointRef.current), destination, routeAlgorithm || algorithm, route.durationSeconds, route.distanceMeters, benchmark);
      tripRef.current = trip;
      setLastTrip(trip);
      setRerouteCount(0);
      changeState('DRIVING');
      setFollow(true);
    } catch { setError('기기 저장소를 사용할 수 없어 주행을 시작할 수 없습니다.'); }
    finally { setBusy(false); }
  }, [route, destination, benchmarkMinutes, benchmarkKilometers, routeAlgorithm, algorithm, busy, changeState]);

  const stopDriving = useCallback(async () => {
    if (!tripRef.current || busy) return;
    setBusy(true);
    try {
      await pointWriteRef.current;
      setLastTrip(await finishTrip(tripRef.current));
      tripRef.current = null;
      changeState('ROUTE_READY');
      setFollow(false);
      refreshCounts();
    } catch { setError('주행 종료 기록을 저장하지 못했습니다. 다시 시도해주세요.'); }
    finally { setBusy(false); }
  }, [busy, changeState, refreshCounts]);

  const remainingSeconds = route && remainingMeters !== null ? remainingRouteSeconds(route, progressAlongGeometryMeters) : null;
  const wakeLockStatus = useScreenWakeLock(state === 'DRIVING' || state === 'ARRIVED');
  const nextInstruction = route ? upcomingInstruction(route, progressMeters) : null;
  let benchmarkError: string | null = null;
  try { parseManualBenchmark(benchmarkMinutes, benchmarkKilometers); }
  catch (failure) { benchmarkError = failure instanceof Error ? failure.message : 'TMAP 벤치마크 입력을 확인해주세요.'; }
  return { state, point, speed, destination, destinationName, route, algorithm, routeAlgorithm, selectAlgorithm, benchmarkMinutes, setBenchmarkMinutes, benchmarkKilometers, setBenchmarkKilometers, benchmarkError, error, pendingCount, totalPoints, online, follow, setFollow, busy, remainingMeters, remainingSeconds, distanceFromRoute, nextInstruction, offRouteCount, rerouteCount, lastTrip, routeApiStatus, syncDiagnostics, wakeLockStatus, requestRoute, startDriving, stopDriving };
}
