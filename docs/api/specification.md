# Backend API 계약 — Frontend 사용 범위

이 저장소에는 Backend handler가 없다. Frontend는 동일 origin의 `/api` 상대경로만 호출하며, Vite 개발 서버는 `/api`를 Edge로 프록시한다. 모든 좌표는 WGS84 `{lat:number,lng:number}`, 모든 시각은 Unix epoch milliseconds다. 인증은 없다. HTTP timeout은 12초다.

처리된 API 오류 응답은 `{"error":"CODE"}`이며 `message`는 없다. FE는 문자열 `error`를 읽어 사용자 메시지와 DBG 상태로 변환한다. 413처럼 JSON이 아닌 오류도 HTTP status로 실패 처리한다. 아래 오류 코드와 status는 현재 Backend 계약을 따른다.

## POST /api/routes

- 설명: OUR 경로 계산. 인증 없음. Path/query params 없음.
- Request body: `origin` (필수 object `{lat:number,lng:number}`, null 불가), `destination` (필수 동일), `algorithm` (필수 string, enum `BASELINE` 또는 `DIRECTION_AWARE`, null 불가).
- Response 200: `routeId` (필수 UUID string), `algorithm` (필수 enum `BASELINE`/`DIRECTION_AWARE`), `algorithmVersion` (필수 string), `distanceMeters`/`durationSeconds` (필수 0 이상 integer), `geometry` (필수 `{lat:number,lng:number}[]`), `segments` (필수 `RouteSegment[]`). `RouteSegment`: `edgeId` (필수 string), `observedSpeed`/`baseSpeed`/`effectiveSpeed` (필수 number, km/h), `attribution` (필수 number, 0..1). 응답 필드는 null 불가.
- 일반 경로는 `geometry.length >= 2`다. `geometry.length === 1`은 `distanceMeters === 0 && durationSeconds === 0`일 때만 정상 zero-distance route다. 좌표가 없거나 이 조건을 벗어나면 FE가 오류 처리한다. MapLibre에는 각 좌표를 `[lng,lat]`로 넘기며, 선은 좌표 2개 이상일 때만 그린다.
- 오류: `400 INVALID_REQUEST` — 입력 또는 알고리즘 오류; `422 ROUTE_NOT_FOUND` — 경로 없음; `503 ENGINE_UNAVAILABLE` — 경로 엔진 장애. FE는 OUR 경로 실패를 표시한다.

## GET /api/routes/{routeId}

- 설명: 재접속 후 활성 Trip의 저장 경로 복원. 인증 없음. Path param `routeId` 필수 string, query/body 없음.
- Response 200: `POST /api/routes`와 동일한 저장 응답. 기존 저장 route의 `algorithm`과 `algorithmVersion`은 null일 수 있다. FE는 복원한 route ID와 Trip의 route ID가 같은지 확인한다.
- 오류: `404 ROUTE_NOT_FOUND` — 저장된 ID 없음. 복원 실패 시에도 local GPS 기록과 주행 종료는 계속 가능하다.

## POST /api/trips

- 설명: client ID 기반 멱등 주행 생성. 인증 없음. Path/query params 없음.
- Request body: `clientTripId` (필수 string, 주행 시작 시 생성한 UUID), `routeId` (필수 string), `startedAt` (필수 number), `origin`, `destination` (각각 필수 `{lat:number,lng:number}`), `ourEtaSeconds` (필수 number), `tmapEtaSeconds` (number 또는 null), `tmapDistanceMeters` (number 또는 null). TMAP 값은 별도 모바일 앱에서 사람이 확인해 입력한 출발 시점 스냅샷이다. 미입력 시 둘 다 null이다. OUR 계획 거리는 local trip에도 보존하고 Backend는 `routeId`의 경로 거리와 연결해 비교에 사용해야 한다.
- Response 201(신규)/200(동일 metadata 재전송): `tripId`와 `clientTripId` (필수 UUID string, null 불가). FE는 응답 `clientTripId`가 저장된 ID와 같을 때만 server ID를 연결한다.
- 오류: `400 INVALID_REQUEST` — 잘못된 UUID·필드·음수 또는 동일 client ID에 다른 metadata. `routeId` 존재 여부는 생성 시 검사하지 않는다. FE는 저장된 동일 metadata로 재시도한다. 기존 v1 local trip은 `clientTripId=localId`로 이전되며 이전 ETA가 없는 경우 `ourEtaSeconds=0`으로 전송한다.

## POST /api/trips/{tripId}/points

- 설명: GPS point batch 저장. 인증 없음. Path param `tripId` 필수 string, query 없음.
- Request body: `points` (필수 array, Backend 허용 1~1000개 및 body 256 KiB 이하; FE는 최대 10개). 각 원소는 `pointId` (필수 string, IndexedDB point ID), `timestamp`, `lat`, `lng` (필수 number); `gpsSpeed`, `heading`, `accuracy` (number 또는 null). `gpsSpeed`는 **m/s**이고 UI 속도만 km/h다.
- Response 200: `pointsReceived`/`pointsStored` (필수 integer). 중복 `pointId`는 기존 기록을 유지해 `pointsStored`가 0일 수 있다. FE는 `pointsReceived`가 보낸 건수와 같을 때만 batch를 synced로 표시한다.
- 오류: `400 INVALID_REQUEST` — 잘못된 point; `404 TRIP_NOT_FOUND` — trip 없음; `413` — 256 KiB 초과, JSON body 보장 없음. 응답 유실 시 같은 `pointId`를 재전송하므로 Backend는 point ID로 중복 제거한다.

## POST /api/trips/{tripId}/finish

- 설명: 남은 point 동기화 후 주행 종료. 인증 없음. Path param `tripId` 필수 string, query 없음.
- Request body: `finishedAt` (필수 number), `actualDurationSeconds` (필수 number). null 불가.
- Response 204: 성공, body 없음. FE는 JSON body를 파싱하지 않는다.
- 오류: `400 INVALID_REQUEST` — 종료 입력 오류; `404 TRIP_NOT_FOUND` — trip 없음; `503` — 서버 장애. 응답 유실 시 동일 종료 시각으로 재시도하며 Backend는 이를 멱등 처리해야 한다.

## 외부 연동 및 실패 경계

- TMAP API 연동과 키는 필요하지 않다. 사용자가 별도 TMAP 앱의 ETA·거리를 선택적으로 입력한다. FE는 Engine `:8090`/`/internal/*`에 직접 접속하지 않는다.
- 온라인 이벤트와 5초 주기 동기화가 local trip 생성 → point batch → finish 순서로 재시도한다. 업로드 성공 후에만 point를 synced로 변경한다.
- `segments.length === geometry.length - 1`일 때만 Debug 지도에 segment diagnostic line을 표시한다. 불일치해도 경로 자체는 유지한다.
