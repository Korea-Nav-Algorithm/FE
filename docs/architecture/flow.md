# 주요 흐름

1. 접속 즉시 고정밀 Geolocation watch를 시작한다. 권한 거부·GPS 실패를 화면에 표시한다.
2. preset 또는 지도 click으로 목적지를 정한다. DBG에서 `BASELINE`/`DIRECTION_AWARE`를 선택할 수 있다. OUR 경로가 성공하면 선·ETA를 표시한다. zero-distance 경로는 선 없이 정상 처리한다. TMAP 값은 별도 앱에서 확인해 DBG에 선택적으로 수동 입력한다.
3. 주행 시작 전에 고정 `clientTripId`, OUR 계획 시간·거리와 수동 TMAP ETA·거리 스냅샷을 포함한 local trip을 IndexedDB에 먼저 생성한다. Backend 생성 실패는 동일 ID와 값으로 재시도한다.
4. GPS 콜백은 약 1초 이상 간격의 point를 IndexedDB에 저장한다. 정확도 60m 초과는 표시만 경고하고 기록은 보존한다.
5. 온라인 이벤트와 5초 주기 동기화가 저장된 `pointId`를 최대 10개씩 업로드한다. 200 응답의 `pointsReceived`가 보낸 건수와 같을 때만 synced로 표시한다. 중복 point는 `pointsStored=0`이어도 정상이다.
6. 정확한 GPS가 경로에서 80m 이상 3회 연속 벗어나면 현재 algorithm과 목적지로 `POST /api/routes`를 다시 호출한다. 실패해도 기존 경로와 기록을 유지한다. 정확한 GPS가 목적지 50m 안에 8초 머물면 도착 표시한다.
7. 종료 시 종료 시각을 먼저 저장하고 남은 point 업로드를 시도한 뒤 Backend finish를 호출한다. 빈 204 응답을 성공으로 처리하며, 실패하면 동일 종료 시각으로 후속 동기화한다.
8. 지원 브라우저에서는 주행 중 Screen Wake Lock을 시도하고, 주행 종료 시 해제한다. 지원하지 않거나 거부되어도 주행 흐름은 유지한다.
9. 페이지 재접속으로 미종료 Trip을 복원할 때 원래 `routeId`로 `GET /api/routes/{routeId}`를 호출한다. 조회가 실패해도 GPS 기록과 종료는 유지한다.

빈 경로, API 오류, 지도 style 오류는 화면에 표시한다. Mock 경로는 직선이라는 경고를 유지한다.
