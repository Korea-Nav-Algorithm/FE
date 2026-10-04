# Navigation Test Client 구현 현황

이 문서는 현재 프론트엔드 코드에 구현된 기능과 검증 범위를 기록한다. Backend 서버 구현과 실제 차량 주행 검증 결과를 뜻하지 않는다. 실행·환경변수 안내는 [README](../README.md), Backend 요청·응답 형식은 [API 명세](api/specification.md)를 참고한다.

## 구현된 사용자 흐름

| 단계 | 현재 동작 | 구현 위치 |
| --- | --- | --- |
| 접속 및 위치 확인 | 로그인 없이 화면을 열고 `watchPosition`으로 현재 위치 수신을 시작한다. 첫 GPS를 받으면 지도 중심과 현재 위치 marker를 갱신한다. | `src/features/navigation/services/geolocation.ts`, `src/features/navigation/hooks/useNavigation.ts`, `src/features/navigation/components/NavigationMap.tsx` |
| 목적지 선택 | 분당중앙교회 preset 또는 지도 클릭 좌표를 선택한다. preset 좌표는 한 설정 파일에 둔다. | `src/features/navigation/services/config.ts`, `src/App.tsx` |
| 경로 계산 | `RouteProvider`가 개발용 Mock 직선 경로 또는 `POST /api/routes` 결과를 받는다. 일반 경로는 좌표 2개 이상, 거리·시간이 모두 0인 zero-distance 경로는 좌표 1개도 정상 처리한다. 지도 선은 좌표 2개 이상일 때만 표시한다. | `src/features/navigation/services/providers.ts`, `src/features/navigation/services/routeValidation.ts`, `src/features/navigation/components/NavigationMap.tsx` |
| ETA 및 벤치마크 | OUR 거리·시간·도착 예정 시각을 표시한다. 별도 TMAP 앱에서 확인한 ETA·거리를 DBG에서 선택적으로 수동 입력한다. TMAP API 호출은 없다. | `src/features/navigation/services/manualBenchmark.ts`, `src/App.tsx` |
| 주행 시작 | `clientTripId`, OUR 계획 시간·거리, 수동 TMAP 값의 스냅샷을 포함한 local trip을 IndexedDB에 먼저 저장한다. 서버 trip 생성은 비동기로 시도하며 동일 ID·입력값으로 재시도한다. | `src/features/navigation/services/tripSync.ts`, `src/features/navigation/services/gpsStore.ts` |
| 주행 중 | GPS 현재 속도, 추정 남은 거리·시간, 현재 위치와 경로를 표시한다. 지도가 위치를 따라가며 유효한 heading이 있으면 회전한다. 사용자가 지도를 움직이면 follow가 꺼지고 현재 위치 버튼으로 다시 켠다. 재접속 시 원래 route ID를 `GET /api/routes/{routeId}`로 복원한다. | `src/features/navigation/hooks/useNavigation.ts`, `src/features/navigation/components/NavigationMap.tsx`, `src/App.tsx` |
| 주행 종료 | 종료 시각을 로컬 trip에 먼저 저장한다. 남은 point 업로드 후 Backend 종료 요청을 시도하며, 실패한 기록은 재시도를 위해 유지한다. | `src/features/navigation/services/tripSync.ts` |

## GPS와 오프라인 기록

- Geolocation 옵션은 `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 5000`이다. 브라우저가 콜백을 보내는 주기는 기기·브라우저가 결정한다. 코드는 마지막 저장 시각과 900ms 이상 떨어진 point만 기록하므로 **정확히 1초마다 새 GPS point를 보장하지 않는다**.
- 위도·경도, 시각, 정확도, 속도, 방향을 보존한다. 브라우저 속도가 `null`이면 이전 point와의 Haversine 거리 및 시간으로 km/h를 계산하고, 저장·업로드에는 m/s로 환산한다. GPS 정확도가 60m보다 나쁘면 경고하지만 point를 삭제하지 않는다.
- 각 point는 고유 ID와 `synced=false`로 IndexedDB `points` store에 먼저 저장된다. 서버 전송의 `pointId`는 이 ID와 같으며 재전송 때도 변하지 않는다. 별도의 메모리 버퍼는 없으며, 로컬 저장 완료가 업로드보다 앞선다. `trips` store는 불변 `clientTripId`, nullable server ID, OUR 계획값, 수동 TMAP 스냅샷, 시작·종료 시각과 동기화 상태를 보관한다. v1/v2 데이터의 point ID를 유지하는 v3 마이그레이션이 있다. 상세 스키마는 [로컬 저장소 스키마](database/schema.md)에 있다.
- 온라인 이벤트 및 5초 주기 작업이 미동기화 point를 시각순 최대 10개씩 전송한다. Backend 200 응답의 `pointsReceived`가 보낸 건수와 같을 때만 `synced=true`가 된다. 서버 trip 생성에 실패하면 local ID를 유지하고 다음 동기화에서 재시도한다. 페이지 재접속 시 미종료 trip을 복원하며, 저장 경로 조회에 실패해도 GPS 저장과 종료는 계속할 수 있다.
- HTTP 응답이 유실되면 같은 `clientTripId`, `pointId`, 종료 시각으로 재전송한다. Backend는 이를 멱등 처리해야 한다. 사이트 데이터 삭제, 저장소 손상, 브라우저의 백그라운드 위치 수집 중단은 이 MVP가 복구할 수 없다.

## 주행 판단과 지도

- 경로 이탈은 GPS 정확도가 60m 이하인 point에서만 검사한다. 경로 선에서 80m 초과가 3회 연속이면 현재 좌표에서 재경로를 요청한다.
- 목적지까지 직선거리 50m 이하가 정확한 GPS로 8초 이상 유지되면 `ARRIVED`를 표시한다. 자동 종료하지 않으며 주행 종료 버튼을 누를 수 있다.
- 남은 거리는 경로 좌표의 최근접 꼭짓점부터 남은 선 길이로 추정한다. 남은 시간은 원래 경로 시간에 남은 거리 비율을 곱한 값이다. 실시간 교통을 반영한 Backend 재계산 ETA는 구현되어 있지 않다.
- MapLibre 스타일 URL과 초기 확대 수준은 `config.ts`에서 관리한다. 지도 확대·축소, 현재 위치로 이동, 전체 경로 보기를 제공한다. Debug에서 `segments.length === geometry.length - 1`일 때만 구간 선을 색으로 표시하고 클릭 시 속성 popup을 연다. 구간과 좌표가 정렬되지 않으면 선 시각화 대신 안내 문구를 표시한다.

## 모드·오류·설정

- `VITE_USE_MOCK_API=false`가 실차 테스트 값이다. 개발에서만 명시적으로 `true`로 설정할 수 있고 production build에서 `true`이면 빌드가 중단된다. Mock OUR 경로는 **직선**이다.
- Frontend API는 항상 동일 origin의 `/api` 상대경로를 사용한다. 개발 프록시 대상은 `VITE_DEV_API_TARGET`으로 설정한다. HTTP timeout은 12초다. Backend 오류 문자열 `{"error":"CODE"}`를 읽고, JSON이 없는 413도 status로 처리한다. TMAP API Key는 필요하지 않다.
- DBG에서 `BASELINE`/`DIRECTION_AWARE`를 선택하고 현재 route algorithm·routeId, GPS 좌표·속도·정확도, 경로 이탈 거리·연속 횟수·재탐색 횟수, local/server trip ID, API 단계별 결과를 확인한다. 지원 브라우저의 주행 중 Screen Wake Lock 상태도 확인할 수 있다.
- 위치 권한 거부, GPS 실패, OUR 경로 실패, 지도 오류, 오프라인 상태, IndexedDB 저장 실패를 화면에 구분해 표시한다. DBG 패널에는 GPS/구간/OUR ETA/수동 TMAP 벤치마크/point 수/미동기화 수/네트워크 상태를 표시하고 누락 값은 `N/A`로 표시한다.
- 상태는 `LOCATING`, `IDLE`, `ROUTE_READY`, `DRIVING`, `ARRIVED`, `ERROR`이며 전이 규칙은 [상태 문서](architecture/state.md)에 있다.

## 검증 상태와 남은 현장 확인

거리·속도·경로 이탈·IndexedDB, zero-distance, 알고리즘 요청, 저장소 이전, 고정 Trip/point ID와 수동 TMAP 값 재시도, m/s 단위, 204 종료 응답을 테스트한다. 최신 Backend 계약에 맞춰 문자열 오류 본문, 저장 경로 GET, 비JSON 413, GPS batch 수신 건수, Trip 응답 client ID 일치 검증도 추가했다. 최신 실행 결과는 작업 종료 보고를 기준으로 한다. 정적 검사는 실제 지도 타일 표시나 기기 GPS 품질의 증거가 아니다.

브라우저 자동 검증 도구가 연결되지 않아 다음 항목은 **미검증**이다: 모바일 지도 시각 표시, 실제 GPS 위치·속도, 목적지 터치 흐름, 네트워크 중단 시 DBG pending 증가 및 복구 후 감소, 실제 Backend 응답, 수동 TMAP 입력 UX, 도착 감지와 차량 주행 결과. 이번 작업에서 `localhost:8080/health`도 시간 초과되어 실제 Edge 서버 요청은 검증하지 못했다. 모바일에서는 HTTPS 보안 컨텍스트가 필요하며, 브라우저가 화면 잠금·백그라운드에서 위치 콜백을 중단할 수 있다. 실제 주행 전 [README의 모바일 GPS 테스트](../README.md#모바일-gps-테스트)를 수행해야 한다.
