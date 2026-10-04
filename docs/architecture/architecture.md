# Navigation Test Client 아키텍처

React 화면은 `useNavigation` hook에서 상태와 명령을 받고, hook은 전용 service/adapter만 호출한다. MapLibre 컴포넌트는 경로와 위치의 표시 및 지도 이벤트만 담당한다. 모든 HTTP 호출은 `httpClient.ts`의 `postJson`을 통과하며 `/api` 상대경로만 사용한다. TMAP은 별도 앱으로 수동 벤치마크하므로 API Key가 필요 없다. 인증은 없다.

Geolocation watch → hook → IndexedDB 저장 → `tripSync` batch 업로드 순서다. 업로드가 실패해도 저장 기록의 `synced=false`를 유지한다. 온라인 이벤트와 5초 주기 작업이 재시도한다. 서버 trip 생성이 실패하면 같은 `clientTripId`로 재요청하고 나중에 서버 ID를 연결한다. 각 GPS point는 저장된 `id`를 `pointId`로 전송한다. 종료 시각과 서버 ID 갱신은 IndexedDB 트랜잭션 안에서 병합해 경합으로 값이 사라지지 않게 한다.

Mock RouteProvider는 두 좌표 사이의 직선을 반환한다. 로컬 개발에서만 명시적으로 켤 수 있고 production에서 Mock 설정이면 빌드를 중단한다. 실제 길찾기나 도로 주행 용도가 아니다. Map 스타일은 `VITE_MAP_STYLE_URL` 하나로 교체한다. 목적지 좌표는 OpenStreetMap way 436075604에 표시된 분당중앙교회 중심점이다. Screen Wake Lock은 지원 브라우저의 주행 상태에서만 요청하며 실패해도 경로·GPS 흐름은 유지한다.
