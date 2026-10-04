import { useState } from 'react';
import { DESTINATIONS, NAVIGATION_CONFIG } from './features/navigation/services/config';
import { mockMode } from './features/navigation/services/providers';
import { nearestRouteSegmentIndex } from './features/navigation/services/geo';
import { useNavigation } from './features/navigation/hooks/useNavigation';
import { NavigationMap } from './features/navigation/components/NavigationMap';
import type { Coordinate } from './features/navigation/types/navigation';

function minutes(seconds: number | null): string { return seconds === null ? '—' : `${Math.max(0, Math.ceil(seconds / 60))}분`; }
function kilometers(meters: number | null): string { return meters === null ? '—' : `${(meters / 1000).toFixed(1)} km`; }
function eta(seconds: number | null): string { return seconds === null ? '—' : new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(Date.now() + seconds * 1000); }
function display(value: number | string | undefined | null, unit = ''): string { return value === null || value === undefined ? 'N/A' : `${value}${unit}`; }

export default function App() {
  const navigation = useNavigation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [selectedMapPoint, setSelectedMapPoint] = useState<Coordinate | null>(null);
  const driving = navigation.state === 'DRIVING' || navigation.state === 'ARRIVED';
  const selectDestination = (coordinate: Coordinate, name: string) => { setSheetOpen(false); setSelectedMapPoint(null); navigation.requestRoute(coordinate, name); };
  const onMapPick = (coordinate: Coordinate) => { if (!driving) { setSelectedMapPoint(coordinate); setSheetOpen(true); } };
  const route = navigation.route;
  const segmentIndex = route && navigation.point && route.segments?.length === route.geometry.length - 1
    ? nearestRouteSegmentIndex({ lat: navigation.point.latitude, lng: navigation.point.longitude }, route.geometry) : null;
  const segment = segmentIndex === null ? undefined : route?.segments?.[segmentIndex];

  return <main className={`app${driving ? ' is-driving' : ''}`}>
    <NavigationMap point={navigation.point} destination={navigation.destination} route={navigation.route} follow={navigation.follow} driving={driving} debug={debugOpen} onPick={onMapPick} onUserMove={() => navigation.setFollow(false)} onRecenter={() => navigation.setFollow(true)} />
    <header className="top-bar">
      <button className="destination-button" type="button" onClick={() => setSheetOpen(true)} disabled={driving} aria-label="목적지 선택">
        <span className="destination-icon">⌖</span><span><small>목적지</small><strong>{navigation.destinationName}</strong></span><span className="chevron">⌄</span>
      </button>
      {mockMode && <span className="mock-badge">MOCK 경로</span>}
    </header>
    {!navigation.online && <div className="network-banner">오프라인 · 주행 기록은 기기에 저장 중</div>}
    {navigation.point?.accuracy !== null && navigation.point?.accuracy !== undefined && navigation.point.accuracy > NAVIGATION_CONFIG.poorAccuracyMeters && <div className="accuracy-banner">GPS 정확도 낮음 · {Math.round(navigation.point.accuracy)}m</div>}
    {navigation.error && <div className="error-banner" role="alert"><span>{navigation.error}</span>{navigation.destination && !driving && <button type="button" onClick={() => navigation.requestRoute(navigation.destination!, navigation.destinationName)}>다시 시도</button>}</div>}

    {driving ? <>
      <section className="driving-eta" aria-label="남은 경로"><strong>{minutes(navigation.remainingSeconds)}</strong><span>{kilometers(navigation.remainingMeters)} 남음</span></section>
      <div className="speedometer"><strong>{navigation.speed === null ? '—' : Math.round(navigation.speed)}</strong><span>km/h</span></div>
      <div className="driving-bottom">{navigation.state === 'ARRIVED' && <p className="arrival">목적지에 도착했습니다.</p>}<button className="finish-button" type="button" onClick={navigation.stopDriving} disabled={navigation.busy}>주행 종료</button></div>
    </> : <section className="bottom-card" aria-label="경로 정보">
      {navigation.route ? <>
        <div className="route-row primary"><span className="route-label">OUR</span><strong>{minutes(navigation.route.durationSeconds)}</strong><span>{kilometers(navigation.route.distanceMeters)}</span></div>
        <p className="arrival-time">도착 예정 <strong>{eta(navigation.route.durationSeconds)}</strong></p>
        {mockMode && <p className="mock-note">직선 Mock 경로 · 실제 도로 안내에 사용하지 마세요</p>}
        <button className="start-button" type="button" onClick={navigation.startDriving} disabled={navigation.busy || !navigation.point || !!navigation.benchmarkError}>주행 시작</button>
      </> : <div className="empty-route"><strong>{navigation.state === 'LOCATING' ? '현재 위치 확인 중' : '어디로 가시나요?'}</strong><p>목적지를 선택하거나 지도를 눌러 위치를 지정하세요.</p><button className="start-button" type="button" onClick={() => setSheetOpen(true)}>목적지 선택</button></div>}
    </section>}

    <button className="debug-toggle" type="button" onClick={() => setDebugOpen(!debugOpen)} aria-label="디버그 정보">DBG</button>
    {debugOpen && <aside className="debug-sheet" aria-label="디버그 정보"><div className="sheet-head"><strong>주행 진단</strong><button type="button" onClick={() => setDebugOpen(false)} aria-label="닫기">×</button></div>
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
        ['Route edge', display(segment?.edgeId)], ['OBS speed', display(segment?.observedSpeed, ' km/h')], ['BASE speed', display(segment?.baseSpeed, ' km/h')], ['ATTR', display(segment?.attribution)], ['EFF speed', display(segment?.effectiveSpeed, ' km/h')],
        ['OUR ETA', display(navigation.route ? minutes(navigation.route.durationSeconds) : null)], ['OUR planned distance', display(navigation.lastTrip?.ourDistanceMeters?.toFixed(0), ' m')],
        ['TMAP benchmark ETA', display(navigation.lastTrip?.tmapEtaSeconds === null ? null : navigation.lastTrip?.tmapEtaSeconds === undefined ? null : minutes(navigation.lastTrip.tmapEtaSeconds))],
        ['TMAP benchmark distance', display(navigation.lastTrip?.tmapDistanceMeters?.toFixed(0), ' m')],
        ['Local GPS points', navigation.totalPoints], ['Pending sync', navigation.pendingCount],
        ['Client trip ID', display(navigation.lastTrip?.clientTripId)], ['Server trip ID', display(navigation.lastTrip?.serverId)],
        ['API OUR route', navigation.routeApiStatus], ['API trip create', navigation.syncDiagnostics.trip], ['API GPS batch', navigation.syncDiagnostics.points], ['API finish', navigation.syncDiagnostics.finish],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </aside>}
    {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}><section className="destination-sheet" onClick={(event) => event.stopPropagation()} aria-label="목적지 선택"><div className="sheet-head"><strong>목적지 선택</strong><button type="button" onClick={() => setSheetOpen(false)} aria-label="닫기">×</button></div>
      {DESTINATIONS.map((preset) => <button key={preset.id} className="destination-option" type="button" onClick={() => selectDestination(preset, preset.name)}><span>⌖</span><span><strong>{preset.name}</strong><small>경기도 성남시 분당구 효자길 39</small></span><span>→</span></button>)}
      {selectedMapPoint ? <button className="destination-option" type="button" onClick={() => selectDestination(selectedMapPoint, '지도에서 선택한 위치')}><span>●</span><span><strong>지도에서 선택한 위치</strong><small>{selectedMapPoint.lat.toFixed(5)}, {selectedMapPoint.lng.toFixed(5)}</small></span><span>→</span></button> : <p className="map-pick-help">사용자 지정 위치는 지도를 눌러 선택하세요.</p>}
    </section></div>}
  </main>;
}
