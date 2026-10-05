# 모듈 경계

- `App`: 화면 배치와 사용자 입력 전달. 비즈니스 상태 전이는 hook 명령으로 요청한다.
- `NavigationMap`: MapLibre 인스턴스, marker, route layer, 지도 click/drag 이벤트. geometry index 범위로 교통 선을 표시하고 Debug에서 구간 속성을 조회한다. 하단 카드 높이를 받아 경로 전체 보기의 여백을 정한다.
- `NavigationIcon`, `TrafficLegend`: 화면 전용 아이콘과 교통 범례. 비즈니스 상태는 변경하지 않는다. 상세 배치는 [화면 구성](ui.md)에 있다.
- `useNavigation`: 상태 전이, 이탈 3회, 도착 8초, GPS 정확도 판단.
- `providers`: `RouteProvider` 인터페이스의 Mock/실제 구현. HTTP 요청은 `httpClient`가 담당한다. 수동 TMAP 값 변환은 `manualBenchmark`가 담당한다.
- `apiPayloads`: 저장된 `clientTripId`·`pointId`를 동일하게 재사용하는 요청 DTO 변환.
- `gpsStore`와 `tripSync`: IndexedDB 저장과 재전송 책임. 기존 Trip 갱신은 원자적으로 병합한다.
- `useScreenWakeLock`: 주행 중 화면 켜짐 요청·해제·가시성 복귀 시 재요청. 실패해도 주행은 유지한다.
