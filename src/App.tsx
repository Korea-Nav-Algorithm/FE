import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { DESTINATIONS, NAVIGATION_CONFIG } from './features/navigation/services/config';
import { mockMode } from './features/navigation/services/providers';
import { nearestRouteSegmentIndex } from './features/navigation/services/geo';
import { trafficSummary } from './features/navigation/services/routeTraffic';
import { placeSearchErrorMessage, searchPlaces, type PlaceResult } from './features/navigation/services/placeSearch';
import { useNavigation } from './features/navigation/hooks/useNavigation';
import { NavigationMap } from './features/navigation/components/NavigationMap';
import { ManeuverIcon, NavigationIcon } from './features/navigation/components/NavigationIcon';
import { TrafficLegend } from './features/navigation/components/TrafficLegend';
import type { Coordinate } from './features/navigation/types/navigation';
import type { ManeuverType } from './features/navigation/types/navigation';

function minutes(seconds: number | null): string { return seconds === null ? '—' : `${Math.max(0, Math.ceil(seconds / 60))}분`; }
function kilometers(meters: number | null): string { return meters === null ? '—' : `${(meters / 1000).toFixed(1)} km`; }
function eta(seconds: number | null): string { return seconds === null ? '—' : new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(Date.now() + seconds * 1000); }
function display(value: number | string | undefined | null, unit = ''): string { return value === null || value === undefined ? 'N/A' : `${value}${unit}`; }
const maneuverLabels: Record<ManeuverType, string> = {
  START: '경로 시작', CONTINUE: '직진', SLIGHT_LEFT: '왼쪽 방향', TURN_LEFT: '좌회전',
  SLIGHT_RIGHT: '오른쪽 방향', TURN_RIGHT: '우회전', U_TURN: '유턴', ARRIVE: '목적지 도착',
};
function guidanceDistance(meters: number): string { return meters >= 1000 ? (meters / 1000).toFixed(1) : `${Math.round(meters / 10) * 10}`; }

export default function App() {
  const navigation = useNavigation();
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(240);
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const observer = new ResizeObserver(() => setDockHeight(dock.getBoundingClientRect().height));
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const searchSheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sheetOpen && !debugOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (sheetOpen) searchSheetRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSheetOpen(false); setDebugOpen(false); }
      if (event.key !== 'Tab' || !sheetOpen) return;
      const controls = Array.from(searchSheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary') ?? []).filter((element) => element.offsetParent !== null);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [sheetOpen, debugOpen]);
  const [selectedMapPoint, setSelectedMapPoint] = useState<Coordinate | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeSearchSource, setPlaceSearchSource] = useState<'JSON' | 'NAVER' | null>(null);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [placeSearching, setPlaceSearching] = useState(false);
  const driving = navigation.state === 'DRIVING' || navigation.state === 'ARRIVED';
  const selectDestination = (coordinate: Coordinate, name: string) => { setSheetOpen(false); setSelectedMapPoint(null); navigation.requestRoute(coordinate, name); };
  const onMapPick = (coordinate: Coordinate) => { if (!driving) { setSelectedMapPoint(coordinate); setSheetOpen(true); } };
  const selectManualCoordinate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lat = Number(manualLat.trim());
    const lng = Number(manualLng.trim());
    if (!manualLat.trim() || !manualLng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)
      || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setCoordinateError('위도 -90~90, 경도 -180~180 범위의 좌표를 입력하세요.');
      return;
    }
    setCoordinateError(null);
    selectDestination({ lat, lng }, '입력한 좌표');
  };
  const submitPlaceSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPlaceSearching(true);
    setPlaceSearchError(null);
    try {
      const response = await searchPlaces(placeQuery);
      setPlaceResults(response.places);
      setPlaceSearchSource(response.source);
    } catch (failure) {
      setPlaceResults([]);
      setPlaceSearchError(placeSearchErrorMessage(failure));
    } finally { setPlaceSearching(false); }
  };
  const route = navigation.route;
  const segmentIndex = route && navigation.point && route.segments?.length === route.geometry.length - 1
    ? nearestRouteSegmentIndex({ lat: navigation.point.latitude, lng: navigation.point.longitude }, route.geometry) : null;
  const segment = segmentIndex === null ? undefined : route?.segments?.[segmentIndex];

  const weakGps = navigation.point?.accuracy != null && navigation.point.accuracy > NAVIGATION_CONFIG.poorAccuracyMeters;
  const nextCue = navigation.nextInstruction;

  return <main className={`app${driving ? ' is-driving' : route ? ' has-route' : ' is-browsing'}`} style={{ '--dock-height': `${dockHeight}px` } as CSSProperties}>
    <NavigationMap point={navigation.point} destination={navigation.destination} route={route} follow={navigation.follow} driving={driving} debug={debugOpen} bottomInset={dockHeight} onPick={onMapPick} onUserMove={() => navigation.setFollow(false)} onRecenter={() => navigation.setFollow(true)} />
    {!driving ? <header className="top-bar">
      {route ? <div className="route-addresses">
        <button className="address-back" type="button" onClick={() => setSheetOpen(true)} aria-label="목적지 변경"><NavigationIcon name="back" /></button>
        <div className="address-fields"><div><i className="origin-dot" /><span>현재 위치</span></div><button type="button" onClick={() => setSheetOpen(true)}><i className="arrival-dot" /><strong>{navigation.destinationName}</strong><NavigationIcon name="search" /></button></div>
        <span className="transport-chip"><NavigationIcon name="drive" />자동차 · {minutes(route.durationSeconds)}</span>
      </div> : <button className="destination-button" type="button" onClick={() => setSheetOpen(true)} aria-label="목적지 검색 및 변경" aria-expanded={sheetOpen}>
        <NavigationIcon name="search" /><strong>어디로 갈까요?</strong><NavigationIcon name="arrow" />
      </button>}
    </header> : <header className="driving-guidance" aria-label="다음 경로 지점">
      <div className="maneuver-icon"><ManeuverIcon maneuver={nextCue?.instruction.type} /></div>
      <div className="guidance-main"><strong className={!nextCue ? 'guidance-status' : undefined}>{nextCue ? <>{guidanceDistance(nextCue.distanceMeters)}<small>{nextCue.distanceMeters >= 1000 ? 'km' : 'm'}</small></> : '주행 중'}</strong><span>{nextCue ? `예상 ${maneuverLabels[nextCue.instruction.type]}` : '경로를 따라 이동'}</span></div>
      <div className="guidance-road">{nextCue?.instruction.roadName || navigation.destinationName}</div>
    </header>}
    {driving && <div className="speedometer" aria-label="현재 속도"><strong>{navigation.speed === null ? '—' : Math.round(navigation.speed)}</strong><span>km/h</span></div>}

    <div className="navigation-dock" ref={dockRef}>
      <div className="dock-handle" aria-hidden="true" />
      {navigation.error && <div className="error-banner" role="alert"><span>{navigation.error}</span>{navigation.destination && !driving && <button type="button" onClick={() => navigation.requestRoute(navigation.destination!, navigation.destinationName)}>다시 시도</button>}</div>}
      {driving ? <section className="driving-bottom" aria-label="남은 경로">
        {navigation.state === 'ARRIVED' && <p className="arrival">목적지에 도착했습니다</p>}
        <div className="driving-destination">{navigation.destinationName}</div>
        <div className="journey-row">
          <button className="finish-button" type="button" onClick={navigation.stopDriving} disabled={navigation.busy}><NavigationIcon name="close" /><span>{navigation.busy ? '저장 중' : '종료'}</span></button>
          <div className="journey-summary"><strong className="arrival-clock">{eta(navigation.remainingSeconds)} <small>도착</small></strong><span><b>{minutes(navigation.remainingSeconds)}</b><i />{kilometers(navigation.remainingMeters)}</span></div>
          <button className="drive-menu" type="button" onClick={() => setDebugOpen(true)} aria-label="주행 진단 메뉴"><NavigationIcon name="menu" /></button></div>
        {route && <><p className="traffic-note">{trafficSummary(route)}</p><TrafficLegend /></>}
      </section> : <section className="bottom-card" aria-label="경로 정보">
        {route ? <>
          <div className="selected-route-card">
          <div className="route-heading"><span className="route-mode">OUR 경로</span><span className="route-selected">✓</span></div>
          <div className="journey-summary"><strong className="eta-value">{minutes(route.durationSeconds)}</strong><span>{kilometers(route.distanceMeters)} <i />{eta(route.durationSeconds)} 도착 예정</span></div>
          <p className="traffic-note">{trafficSummary(route)}</p>
          <TrafficLegend />
          {mockMode && <p className="mock-note">개발용 직선 경로 · 실제 도로 안내에 사용하지 마세요</p>}
          </div>
          <button className="start-button" type="button" onClick={navigation.startDriving} disabled={navigation.busy || !navigation.point || !!navigation.benchmarkError}>{navigation.busy ? '준비 중' : '안내시작'}</button>
        </> : <div className="empty-route">
          <div className="route-heading"><h1>{navigation.busy ? '경로 탐색 중' : '바로 가기'}</h1><span className="location-state"><i className={navigation.point ? 'is-ready' : ''} />{navigation.point ? '현재 위치' : '위치 확인 중'}</span></div>
          <div className="preset-shortcuts">{DESTINATIONS.map((preset) => <button type="button" key={preset.id} onClick={() => selectDestination(preset, preset.name)} disabled={navigation.busy}><NavigationIcon name="pin" />{preset.name}<NavigationIcon name="arrow" /></button>)}</div>
          <button className="browse-search" type="button" onClick={() => setSheetOpen(true)} disabled={navigation.busy}><NavigationIcon name="search" />목적지 검색</button>
        </div>}
      </section>}
      <footer className="dock-footer"><div className="status-indicators">
        <span className="connection-state"><i className={navigation.online ? 'is-ready' : ''} />{navigation.online ? (driving ? '주행 기록 중' : '연결됨') : '오프라인 · 기기에 저장'}</span>
        {weakGps && <span title={`GPS 정확도 ${Math.round(navigation.point!.accuracy!)}m`}>GPS 약함</span>}
        {mockMode && <span>MOCK</span>}
      </div><button className="debug-toggle" type="button" onClick={() => setDebugOpen(!debugOpen)} aria-label="디버그 정보" aria-expanded={debugOpen}>DBG</button></footer>
    </div>

    {debugOpen && <aside className="debug-sheet" aria-label="디버그 정보"><div className="sheet-head"><strong>주행 진단</strong><button type="button" onClick={() => setDebugOpen(false)} aria-label="닫기"><NavigationIcon name="close" /></button></div>
      <label className="algorithm-select">OUR algorithm
        <select value={navigation.algorithm} onChange={(event) => navigation.selectAlgorithm(event.target.value as 'BASELINE' | 'DIRECTION_AWARE')} disabled={driving}>
          <option value="DIRECTION_AWARE">DIRECTION_AWARE</option><option value="BASELINE">BASELINE</option>
        </select>
      </label>
      {!driving && navigation.route && <div className="benchmark-fields">
        <strong>TMAP 수동 벤치마크 <small>선택 입력 · 별도 TMAP 앱에서 확인</small></strong>
        <label>TMAP 예상 시간 <span><input type="number" min="0" step="1" inputMode="numeric" value={navigation.benchmarkMinutes} onChange={(event) => navigation.setBenchmarkMinutes(event.target.value)} aria-label="TMAP 예상 시간(분)" />분</span></label>
        <label>TMAP 예상 거리 <span><input type="number" min="0" step="0.1" inputMode="decimal" value={navigation.benchmarkKilometers} onChange={(event) => navigation.setBenchmarkKilometers(event.target.value)} aria-label="TMAP 예상 거리(km)" />km</span></label>
        {navigation.benchmarkError && <p role="alert">{navigation.benchmarkError}</p>}
      </div>}
      <dl>{[
        ['Navigation state', navigation.state], ['Network', navigation.online ? 'ONLINE' : 'OFFLINE'], ['Wake Lock', navigation.wakeLockStatus],
        ['Route algorithm', display(navigation.routeAlgorithm)], ['Algorithm version', display(navigation.route?.algorithmVersion)], ['Route ID', display(navigation.route?.routeId)],
        ['Route distance', display(navigation.route?.distanceMeters?.toFixed(0), ' m')], ['Route duration', display(navigation.route?.durationSeconds?.toFixed(0), ' s')],
        ['Remaining distance', display(navigation.remainingMeters?.toFixed(0), ' m')], ['Remaining duration', display(navigation.remainingSeconds?.toFixed(0), ' s')],
        ['GPS latitude', display(navigation.point?.latitude?.toFixed(6))], ['GPS longitude', display(navigation.point?.longitude?.toFixed(6))],
        ['GPS speed', display(navigation.speed === null ? null : Math.round(navigation.speed), ' km/h')], ['GPS accuracy', display(navigation.point?.accuracy?.toFixed(1), ' m')], ['Heading', display(navigation.point?.heading?.toFixed(0), '°')],
        ['Distance to route', display(navigation.distanceFromRoute?.toFixed(0), ' m')], ['Off-route count', navigation.offRouteCount], ['Reroute count', navigation.rerouteCount],
        ['Route edge', display(segment?.edgeId)], ['OBS speed', display(segment?.trafficLevel === 'UNKNOWN' ? null : segment?.observedSpeed, ' km/h')], ['BASE speed', display(segment?.baseSpeed, ' km/h')], ['ATTR', display(segment?.attribution)], ['EFF speed', display(segment?.effectiveSpeed, ' km/h')],
        ['OUR ETA', display(navigation.route ? minutes(navigation.route.durationSeconds) : null)], ['OUR planned distance', display(navigation.lastTrip?.ourDistanceMeters?.toFixed(0), ' m')],
        ['TMAP benchmark ETA', display(navigation.lastTrip?.tmapEtaSeconds === null ? null : navigation.lastTrip?.tmapEtaSeconds === undefined ? null : minutes(navigation.lastTrip.tmapEtaSeconds))],
        ['TMAP benchmark distance', display(navigation.lastTrip?.tmapDistanceMeters?.toFixed(0), ' m')],
        ['Local GPS points', navigation.totalPoints], ['Pending sync', navigation.pendingCount],
        ['Client trip ID', display(navigation.lastTrip?.clientTripId)], ['Server trip ID', display(navigation.lastTrip?.serverId)],
        ['API OUR route', navigation.routeApiStatus], ['API trip create', navigation.syncDiagnostics.trip], ['API GPS batch', navigation.syncDiagnostics.points], ['API reroutes', navigation.syncDiagnostics.routes], ['API finish', navigation.syncDiagnostics.finish],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </aside>}
    {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}><section ref={searchSheetRef} className="destination-sheet" onClick={(event) => event.stopPropagation()} aria-label="목적지 선택" role="dialog" aria-modal="true"><div className="sheet-head"><strong>목적지 선택</strong><button type="button" onClick={() => setSheetOpen(false)} aria-label="닫기"><NavigationIcon name="close" /></button></div>
      <form className="place-search" onSubmit={submitPlaceSearch}>
        <label htmlFor="place-query">어디로 갈까요?</label>
        <div><input id="place-query" value={placeQuery} onChange={(event) => { setPlaceQuery(event.target.value); setPlaceResults([]); setPlaceSearchSource(null); setPlaceSearchError(null); }} placeholder="장소, 건물, 지명 검색" maxLength={80} disabled={placeSearching} />
          <button type="submit" disabled={placeSearching}>{placeSearching ? '검색 중' : '검색'}</button></div>
        {placeSearchError && <p role="alert">{placeSearchError}</p>}
      </form>
      {placeSearchSource === 'JSON' && placeResults.length > 0 && <p className="place-source">개발용 장소 목록 · 실제 건물 검색에는 서버 검색 키가 필요합니다.</p>}
      {placeSearchSource === 'NAVER' && placeResults.length > 0 && <p className="place-source">장소 검색: Naver</p>}
      {placeSearchSource && placeResults.length === 0 && !placeSearchError && <p className="place-source">검색 결과가 없습니다. 다른 이름으로 검색하거나 지도에서 선택해주세요.</p>}
      {placeResults.map((place) => <button key={place.id} className="destination-option" type="button" onClick={() => selectDestination(place.coordinate, place.name)}>
        <NavigationIcon name="pin" /><span><strong>{place.name}</strong><small>{place.address}</small></span><NavigationIcon name="arrow" /></button>)}
      {DESTINATIONS.map((preset) => <button key={preset.id} className="destination-option" type="button" onClick={() => selectDestination(preset, preset.name)}><NavigationIcon name="pin" /><span><strong>{preset.name}</strong><small>경기도 성남시 분당구 효자길 39</small></span><NavigationIcon name="arrow" /></button>)}
      {selectedMapPoint ? <button className="destination-option" type="button" onClick={() => selectDestination(selectedMapPoint, '지도에서 선택한 위치')}><NavigationIcon name="pin" /><span><strong>지도에서 선택한 위치</strong><small>{selectedMapPoint.lat.toFixed(5)}, {selectedMapPoint.lng.toFixed(5)}</small></span><NavigationIcon name="arrow" /></button> : <p className="map-pick-help">사용자 지정 위치는 지도를 눌러 선택하세요.</p>}
      <details className="coordinate-details"><summary>좌표로 직접 찾기</summary><form className="coordinate-form" onSubmit={selectManualCoordinate}>
        <strong>좌표로 목적지 지정</strong>
        <div><label>위도<input type="text" inputMode="decimal" value={manualLat} onChange={(event) => setManualLat(event.target.value)} placeholder="37.37709" /></label>
          <label>경도<input type="text" inputMode="decimal" value={manualLng} onChange={(event) => setManualLng(event.target.value)} placeholder="127.13973" /></label></div>
        {coordinateError && <p role="alert">{coordinateError}</p>}
        <button type="submit">이 좌표로 경로 찾기</button>
      </form></details>
    </section></div>}
  </main>;
}
