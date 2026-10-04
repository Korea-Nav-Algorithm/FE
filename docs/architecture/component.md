# 모듈 경계

- `App`: 화면 배치와 사용자 입력 전달. 비즈니스 상태 전이는 hook 명령으로 요청한다.
- `NavigationMap`: MapLibre 인스턴스, marker, route layer, 지도 click/drag 이벤트. segment와 geometry 변의 수가 일치할 때만 debug segment 선을 표시한다.
- `useNavigation`: 상태 전이, 이탈 3회, 도착 8초, GPS 정확도 판단.
- `providers`: `RouteProvider` 인터페이스의 Mock/실제 구현. HTTP 요청은 `httpClient`가 담당한다. 수동 TMAP 값 변환은 `manualBenchmark`가 담당한다.
- `apiPayloads`: 저장된 `clientTripId`·`pointId`를 동일하게 재사용하는 요청 DTO 변환.
- `gpsStore`와 `tripSync`: IndexedDB 저장과 재전송 책임. 기존 Trip 갱신은 원자적으로 병합한다.
- `useScreenWakeLock`: 주행 중 화면 켜짐 요청·해제·가시성 복귀 시 재요청. 실패해도 주행은 유지한다.
