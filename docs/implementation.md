# Navigation Test Client 구현 현황

이 문서는 현재 프론트엔드 코드에 구현된 기능과 검증 범위를 기록한다. Backend 서버 구현과 실제 차량 주행 검증 결과를 뜻하지 않는다. 실행·환경변수 안내는 [README](../README.md), Backend 요청·응답 형식은 [API 명세](api/specification.md)를 참고한다.

## 구현된 사용자 흐름

TMAP 공식 화면을 기준으로 시각 구성을 수정했다. 경로 준비는 회색 출발·도착 필드와 파란 테두리 경로 카드, 주행은 왼쪽 초록 안내판과 얇은 도착정보 바를 사용한다. 숫자 크기·단위 크기·모서리·여백·원형 지도 버튼을 상태별로 지정했다. 지도에는 흰 진행 화살표와 파란 차량 마커를 표시하고 follow 중 35도 시점을 사용한다. 교통 범례와 작은 GPS·오프라인 표시는 하단에 유지한다. 구성·치수·참고 자료는 [화면 문서](architecture/ui.md)에 있다. 모바일 실제 렌더링은 브라우저 연결 부재로 미검증이다.

| 단계 | 현재 동작 | 구현 위치 |
| --- | --- | --- |
| 접속 및 위치 확인 | 로그인 없이 화면을 열고 `watchPosition`으로 현재 위치 수신을 시작한다. 첫 GPS를 받으면 지도 중심과 현재 위치 marker를 갱신한다. | `src/features/navigation/services/geolocation.ts`, `src/features/navigation/hooks/useNavigation.ts`, `src/features/navigation/components/NavigationMap.tsx` |
| 목적지 선택 | 분당중앙교회 preset, 지도 클릭, WGS84 위도·경도 직접 입력으로 좌표를 선택한다. 입력 범위는 경로 요청 전에 검사한다. preset 좌표는 한 설정 파일에 둔다. | `src/features/navigation/services/config.ts`, `src/App.tsx` |
| 경로 계산 | `RouteProvider`가 개발용 Mock 직선 경로 또는 `POST /api/routes` 결과를 받는다. preset의 `id`·`name`은 요청에서 제거하고 좌표 `lat`·`lng`만 보낸다. 일반 경로는 좌표 2개 이상, 거리·시간이 모두 0인 zero-distance 경로는 좌표 1개도 정상 처리한다. 지도 선은 좌표 2개 이상일 때만 표시한다. Engine의 `instructions`를 화면 안내에 사용한다. | `src/features/navigation/services/providers.ts`, `src/features/navigation/services/apiPayloads.ts`, `src/features/navigation/services/routeValidation.ts`, `src/features/navigation/components/NavigationMap.tsx` |
| ETA 및 벤치마크 | OUR 거리·시간·도착 예정 시각을 표시한다. 별도 TMAP 앱에서 확인한 ETA·거리를 DBG에서 선택적으로 수동 입력한다. TMAP API 호출은 없다. | `src/features/navigation/services/manualBenchmark.ts`, `src/App.tsx` |
| 목적지 검색 | Edge `/api/places`에서 건물·지명을 검색해 이름·주소와 함께 후보를 보여주고 선택 좌표로 경로를 요청한다. 개발 JSON 목록은 1건이며 실제 범용 검색은 Backend의 Naver Search API Client ID·Secret 설정이 필요하다. | `src/features/navigation/services/placeSearch.ts`, `src/App.tsx` |
| 주행 시작 | `clientTripId`, 기기 생성 `accessKey`, OUR 계획 시간·거리, 수동 TMAP 값의 스냅샷을 포함한 local trip을 IndexedDB에 먼저 저장한다. 서버 trip 생성은 비동기로 시도하며 동일 ID·key·입력값으로 재시도한다. Trip 요청의 출발·도착도 `lat`·`lng`만 전송한다. | `src/features/navigation/services/tripSync.ts`, `src/features/navigation/services/apiPayloads.ts`, `src/features/navigation/services/gpsStore.ts` |
| 주행 중 | GPS 현재 속도, 경로 선분 투영에 따른 남은 거리·다음 화면 안내까지 거리, 현재 위치와 경로를 표시한다. 지도가 위치를 따라가며 유효한 heading이 있으면 회전한다. 사용자가 지도를 움직이면 follow가 꺼지고 현재 위치 버튼으로 다시 켠다. 재탐색 route ID와 시각을 로컬에 먼저 보존하고 Trip에 동기화한다. 재접속 시 최신 재탐색 route ID, 없으면 최초 route ID로 `GET /api/routes/{routeId}`를 호출한다. | `src/features/navigation/hooks/useNavigation.ts`, `src/features/navigation/services/routeProgress.ts`, `src/features/navigation/components/NavigationMap.tsx`, `src/App.tsx` |
| 주행 종료 | 종료 시각을 로컬 trip에 먼저 저장한다. 남은 point 업로드 후 Backend 종료 요청을 시도하며, 실패한 기록은 재시도를 위해 유지한다. | `src/features/navigation/services/tripSync.ts` |

## GPS와 오프라인 기록

- Geolocation 옵션은 `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 5000`이다. 브라우저가 콜백을 보내는 주기는 기기·브라우저가 결정한다. 코드는 마지막 저장 시각과 900ms 이상 떨어진 point만 기록하므로 **정확히 1초마다 새 GPS point를 보장하지 않는다**.
- 위도·경도, 시각, 정확도, 속도, 방향을 보존한다. 브라우저 속도가 `null`이면 이전 point와의 Haversine 거리 및 시간으로 km/h를 계산하고, 저장·업로드에는 m/s로 환산한다. GPS 정확도가 60m보다 나쁘면 화면 구석에 작은 상태 표시를 내고 DBG에 수치를 보이지만 point를 삭제하지 않는다. 오프라인 안내도 같은 위치에 작게 표시한다.
- 각 point는 고유 ID와 `synced=false`로 IndexedDB `points` store에 먼저 저장된다. 서버 전송의 `pointId`는 이 ID와 같으며 재전송 때도 변하지 않는다. 별도의 메모리 버퍼는 없으며, 로컬 저장 완료가 업로드보다 앞선다. `trips` store는 `clientTripId`, 기기 `accessKey`, nullable server ID, OUR 계획값, 수동 TMAP 스냅샷, 재탐색 route ID·시각, 시작·종료 시각과 동기화 상태를 보관한다. v4 마이그레이션은 예전 미종료 서버 Trip을 새 client ID/key로 생성해 로컬 point를 다시 전송하고, v5는 `reroutes` 배열을 추가한다. 상세 스키마는 [로컬 저장소 스키마](database/schema.md)에 있다.
- 온라인 이벤트 및 5초 주기 작업이 미동기화 point를 시각순 최대 10개씩 전송한다. Backend 200 응답의 `pointsReceived`가 보낸 건수와 같을 때만 `synced=true`가 된다. 서버 trip 생성에 실패하면 local ID를 유지하고 다음 동기화에서 재시도한다. 페이지 재접속 시 미종료 trip을 복원하며, 저장 경로 조회에 실패해도 GPS 저장과 종료는 계속할 수 있다.
- HTTP 응답이 유실되면 같은 `clientTripId`, `pointId`, 종료 시각으로 재전송한다. Backend는 이를 멱등 처리해야 한다. 사이트 데이터 삭제, 저장소 손상, 브라우저의 백그라운드 위치 수집 중단은 이 MVP가 복구할 수 없다.

## 주행 판단과 지도

- 경로 이탈은 GPS 정확도가 60m 이하인 point에서만 검사한다. 경로 선에서 80m 초과가 3회 연속이면 현재 좌표에서 재경로를 요청한다.
- 목적지까지 직선거리 50m 이하가 정확한 GPS로 8초 이상 유지되면 `ARRIVED`를 표시한다. 자동 종료하지 않으며 주행 종료 버튼을 누를 수 있다.
- GPS를 경로 선분에 투영해 남은 거리를 추정한다. 완전하고 겹침 없는 `geometryStartIndex`~`geometryEndIndex` 매핑이 있으면 각 edge의 `effectiveSpeed`를 좌표 선분에 적용해 남은 통행시간 비율을 계산하고 Backend 계획 ETA에 적용한다. 이전 1:1 snapshot도 같은 계산을 유지하며, 매핑이 불완전하거나 속도가 유효하지 않으면 전체 geometry 거리 비율로 계산한다. 기존 20m 역행 제한은 유지한다. 이 값은 계획 경로의 남은 시간 추정이며, 실시간 교통을 반영한 Backend 재계산 ETA는 구현되어 있지 않다.
- MapLibre 스타일 URL과 초기 확대 수준은 `config.ts`에서 관리한다. Vite는 MapLibre 6 Worker를 `?worker&url`로 번들하고 지도 생성 전에 Worker URL을 지정한다. 지도 확대·축소, 현재 위치로 이동, 전체 경로 보기를 제공한다. 경로의 segment geometry 범위로 교통 상태를 정체 빨강·서행 주황·원활 초록·정보 없음 회색 선으로 표시한다. 매핑되지 않거나 겹치는 선분, 오래된 snapshot의 매핑이 불가능한 구간, `trafficSource=UNKNOWN`은 회색으로 표시한다. 경로·주행 ETA 바로 아래에는 관측 없음 또는 일부 관측 범위와 JSON 개발 데이터 여부를 명시하고, 범례는 하단 ETA 카드에 색상 키를 표시한다. Debug에서는 색상 구간을 눌러 속성과 attribution을 본다.

## 모드·오류·설정

- `VITE_USE_MOCK_API=false`가 실차 테스트 값이다. 개발에서만 명시적으로 `true`로 설정할 수 있고 production build에서 `true`이면 빌드가 중단된다. Mock OUR 경로는 **직선**이다.
- Frontend API는 항상 동일 origin의 `/api` 상대경로를 사용한다. 장소 검색도 Edge `/api/places`를 사용하며 지도 API key를 브라우저에 두지 않는다. 개발 프록시 대상은 `VITE_DEV_API_TARGET`으로 설정한다. HTTP timeout은 12초다. Backend 오류 문자열 `{"error":"CODE"}`를 읽고, JSON이 없는 413도 status로 처리한다. TMAP API Key는 필요하지 않다. 기기별 Trip key는 요청 전 IndexedDB에 저장하고 GPS·종료에는 `X-Trip-Key`로 보낸다. 서버 운영자 key는 Frontend에 보관하지 않는다.
- DBG에서 `BASELINE`/`DIRECTION_AWARE`를 선택하고 현재 route algorithm·routeId, GPS 좌표·속도·정확도, 경로 이탈 거리·연속 횟수·재탐색 횟수, local/server trip ID, API 단계별 결과를 확인한다. 지원 브라우저의 주행 중 Screen Wake Lock 상태도 확인할 수 있다.
- 위치 권한 거부, GPS 실패, OUR 경로 실패, 지도 오류, 오프라인 상태, IndexedDB 저장 실패를 화면에 구분해 표시한다. DBG 패널에는 GPS/구간/OUR ETA/수동 TMAP 벤치마크/point 수/미동기화 수/네트워크 상태를 표시하고 누락 값은 `N/A`로 표시한다.
- 상태는 `LOCATING`, `IDLE`, `ROUTE_READY`, `DRIVING`, `ARRIVED`, `ERROR`이며 전이 규칙은 [상태 문서](architecture/state.md)에 있다.

## 검증 상태와 남은 현장 확인

거리·속도·경로 이탈·경로 선분 진행률·다음 안내 거리·여러 좌표를 포함한 edge별 남은 ETA·불완전 매핑 fallback·교통 출처와 회색 표시·IndexedDB, zero-distance, 알고리즘 요청, 저장소 이전, 고정 Trip/point ID와 Trip key·재탐색 ID·수동 TMAP 값 재시도, m/s 단위, 204 종료 응답을 테스트한다. Backend 계약에 맞춰 문자열 오류 본문, 저장 경로 GET, 비JSON 413, GPS batch 수신 건수, Trip 응답 client ID 일치 검증과 preset 좌표의 API 직렬화도 포함한다. 장소 검색의 동일 origin 요청·좌표 해석·공급자 실패를 검사한다. `npm test` 36건, `npm run lint`, `npm run build`가 2026-10-05 로컬에서 통과했다. 정적 검사는 실제 지도 타일 표시나 기기 GPS 품질의 증거가 아니다.

브라우저 제어 도구가 “No browser is available”을 반환해 다음 항목은 **미검증**이다: 모바일 지도·범례·안내 배치의 실제 시각 표시, 실제 GPS 위치·속도, 목적지 터치 흐름, 네트워크 중단 시 DBG pending 증가 및 복구 후 감소, 수동 TMAP 입력 UX, 도착 감지와 차량 주행 결과. 로컬 Edge `127.0.0.1:28080`의 한 경로 응답에서 `trafficSource=UNKNOWN`, 14구간 중 관측 0개, geometry 15개, ETA 47초를 확인했다. 이는 교통 정보가 실제로 공급된 사례가 아니며 브라우저 UX 검증도 아니다. 모바일에서는 HTTPS 보안 컨텍스트가 필요하며, 브라우저가 화면 잠금·백그라운드에서 위치 콜백을 중단할 수 있다. 실제 주행 전 [README의 모바일 GPS 테스트](../README.md#모바일-gps-테스트)를 수행해야 한다.
