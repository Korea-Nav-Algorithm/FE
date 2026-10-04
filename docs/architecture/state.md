# Navigation 상태

| 상태 | 의미 |
| --- | --- |
| `LOCATING` | 첫 GPS 수신 대기 |
| `IDLE` | GPS 준비, 경로 없음 |
| `ROUTE_READY` | OUR 경로 준비, 주행 전 또는 종료 후 |
| `DRIVING` | GPS point 기록 중 |
| `ARRIVED` | 정확한 GPS가 목적지 50m 안에 8초 이상 머묾, 기록 지속 |
| `ERROR` | 위치 권한 또는 경로 획득 실패 |

`LOCATING → IDLE → ROUTE_READY → DRIVING → ARRIVED → ROUTE_READY`가 기본 흐름이다. 경로 실패 시 `ERROR`, 재시도로 `ROUTE_READY`가 된다. GPS 권한 실패는 `ERROR`이며 브라우저 권한 변경 후 재로드한다. 화면 새로고침 시 미종료 local trip을 복원하고 `DRIVING`으로 진입하며 저장된 route ID를 GET으로 조회한다. route 조회가 실패해도 GPS 기록·종료는 가능하다. Trip은 불변 `clientTripId`, nullable `serverId`, 선택 algorithm, OUR 계획 시간·거리, 수동 TMAP 시간·거리, 시작/종료 시각, 시작/종료 동기화 플래그를 IndexedDB에 저장한다.

선택 algorithm은 `BASELINE` 또는 `DIRECTION_AWARE`이며 기본은 후자다. 주행 중에는 변경할 수 없고 재탐색은 현재 algorithm을 유지한다. Debug의 OUR/Trip 생성/GPS batch/종료 API 상태는 별개다. 수동 TMAP 값은 Trip 시작 시 고정하며 navigation 상태를 바꾸지 않는다. Wake Lock 상태는 `INACTIVE`, `ACTIVE`, `UNSUPPORTED`, `FAILED`로 표시한다.
