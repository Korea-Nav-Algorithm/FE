# Backend API 계약 — Frontend 사용 범위

이 저장소에는 Backend handler가 없다. Frontend는 동일 origin의 `/api` 상대경로만 호출하며, Vite 개발 서버는 `/api`를 Edge로 프록시한다. 모든 좌표는 WGS84 `{lat:number,lng:number}`, 모든 시각은 Unix epoch milliseconds다. 계정 로그인은 없지만 주행 데이터에는 기기에서 생성한 Trip 비밀키가 필요하다. HTTP timeout은 12초다.

처리된 API 오류 응답은 `{"error":"CODE"}`이며 `message`는 없다. FE는 문자열 `error`를 읽어 사용자 메시지와 DBG 상태로 변환한다. 413처럼 JSON이 아닌 오류도 HTTP status로 실패 처리한다. 아래 오류 코드와 status는 현재 Backend 계약을 따른다.

## GET /api/places

- 설명: Edge의 건물·지명 검색. 인증 없음. Path/body 없음. 필수 query `query`는 trim 후 2..80자다.
- Response 200: `places`(0..5개 `PlaceResult[]`, 필수)와 `source`(`JSON|NAVER`, 필수). 각 결과는 `id`,`name`,`address`(필수 string, null 불가; 주소 부재 시 빈 문자열), `coordinate`(필수 WGS84 `{lat,lng}`)를 가진다. 선택된 결과의 이름·좌표로 기존 `POST /api/routes`를 호출한다.
- 오류: 400 `INVALID_REQUEST` — 잘못된 검색어; 503 `PLACE_SEARCH_UNAVAILABLE` — 인증 정보 없음·제공자 장애·개발 파일 오류. 좌표 입력과 지도 선택은 계속 사용할 수 있다. `JSON`은 제한된 개발 장소 목록이며 일반 검색은 서버 전용 Naver Search API Client ID·Secret이 필요하다. FE에는 인증 정보를 두지 않는다. Naver 결과는 OSM graph 범위로 필터되지 않으므로 선택한 장소가 범위 밖이면 route는 422가 될 수 있다.

## POST /api/routes

- 설명: OUR 경로 계산. 인증 없음. Path/query params 없음.
- Request body: `origin` (필수 object `{lat:number,lng:number}`, null 불가), `destination` (필수 동일), `algorithm` (필수 string, enum `BASELINE` 또는 `DIRECTION_AWARE`, null 불가).
- FE 목적지 preset의 `id`·`name`은 UI 필드이며 좌표 객체에 포함해 보내지 않는다. Backend는 정의되지 않은 좌표 필드가 들어오면 400을 반환한다.
- Response 200: `routeId` (필수 UUID string), `algorithm` (필수 enum `BASELINE`/`DIRECTION_AWARE`), `algorithmVersion` (필수 string), `distanceMeters`/`durationSeconds` (필수 0 이상 integer), `geometry` (필수 `{lat:number,lng:number}[]`), `segments` (필수 `RouteSegment[]`), `instructions` (필수 `RouteInstruction[]`), `trafficSource` (필수 enum `JSON|GYEONGGI|UNKNOWN`). `RouteSegment`: `edgeId` (필수 string), `observedSpeed`/`baseSpeed`/`effectiveSpeed` (필수 number, km/h), `attribution` (필수 number, 0..1), `trafficLevel` (필수 enum `UNKNOWN|FREE|SLOW|CONGESTED`), `geometryStartIndex`/`geometryEndIndex` (필수 0 기반 integer, 양 끝 포함). `RouteInstruction`: `type` (필수 enum `START|CONTINUE|SLIGHT_LEFT|TURN_LEFT|SLIGHT_RIGHT|TURN_RIGHT|U_TURN|ARRIVE`), `geometryIndex` (필수 0 기반 integer), `distanceFromStartMeters` (필수 0 이상 integer, m), `roadName` (필수 string, 없으면 빈 문자열), `coordinate` (필수 `{lat:number,lng:number}`). 이전 route snapshot에는 trafficSource/trafficLevel이 없거나 geometry index가 null일 수 있으므로 FE는 UNKNOWN으로 표시한다.
- 일반 경로는 `geometry.length >= 2`다. `geometry.length === 1`은 `distanceMeters === 0 && durationSeconds === 0`일 때만 정상 zero-distance route다. 좌표가 없거나 이 조건을 벗어나면 FE가 오류 처리한다. MapLibre에는 각 좌표를 `[lng,lat]`로 넘기며, 선은 좌표 2개 이상일 때만 그린다.
- 오류: `400 INVALID_REQUEST` — 입력 또는 알고리즘 오류; `422 ROUTE_NOT_FOUND` — 경로 없음; `503 ENGINE_UNAVAILABLE` — 경로 엔진 장애. FE는 OUR 경로 실패를 표시한다.

## GET /api/routes/{routeId}

- 설명: 재접속 후 활성 Trip의 저장 경로 복원. 인증 없음. Path param `routeId` 필수 string, query/body 없음.
- Response 200: `POST /api/routes`와 동일한 저장 응답. 기존 저장 route의 `algorithm`과 `algorithmVersion`은 null일 수 있고, 이전 snapshot에는 `instructions`가 없을 수 있다. FE는 복원한 route ID가 최신 `reroutes` 항목의 ID(없으면 Trip 초기 `routeId`)와 같은지 확인한다.
- 오류: `404 ROUTE_NOT_FOUND` — 저장된 ID 없음. 복원 실패 시에도 local GPS 기록과 주행 종료는 계속 가능하다.

## POST /api/trips

- 설명: client ID와 기기 비밀키 기반 멱등 주행 생성. 계정 로그인 없음. Path/query params 없음.
- Request body: `clientTripId` (필수 string, 주행 시작 시 생성한 UUID), `accessKey` (필수 string, 기기에서 생성한 32바이트 비밀키의 43자 Base64url 인코딩), `routeId` (필수 string), `startedAt` (필수 number), `origin`, `destination` (각각 필수 `{lat:number,lng:number}`), `ourEtaSeconds` (필수 number), `tmapEtaSeconds` (number 또는 null), `tmapDistanceMeters` (number 또는 null). TMAP 값은 별도 모바일 앱에서 사람이 확인해 입력한 출발 시점 스냅샷이다. 미입력 시 둘 다 null이다. OUR 계획 거리는 local trip에도 보존하고 Backend는 `routeId`의 경로 거리와 연결해 비교에 사용해야 한다. FE는 `accessKey`를 첫 요청 전에 IndexedDB에 보존하고 모든 재전송에서 같은 값을 사용한다.
- 재전송할 Trip이 이전 로컬 저장 형식의 preset 객체를 담고 있어도 출발·도착은 `{lat,lng}`만 직렬화한다.
- Response 201(신규)/200(동일 metadata 재전송): `tripId`와 `clientTripId` (필수 UUID string, null 불가). FE는 응답 `clientTripId`가 저장된 ID와 같을 때만 server ID를 연결한다.
- 오류: `400 INVALID_REQUEST` — 잘못된 UUID·필드·key·음수 또는 동일 client ID에 다른 metadata; `404 TRIP_NOT_FOUND` — 동일 client ID에 다른 key. `routeId` 존재 여부는 생성 시 검사하지 않는다. FE는 저장된 동일 metadata와 key로 재시도한다. 기존 v1 local trip은 `clientTripId=localId`로 이전되며 이전 ETA가 없는 경우 `ourEtaSeconds=0`으로 전송한다. 기존 서버 Trip에 key가 없고 미종료 상태라면 새 client ID로 로컬 GPS 전체를 재전송한다.

## POST /api/trips/{tripId}/points

- 설명: GPS point batch 저장. `X-Trip-Key` 헤더 필수. Path param `tripId` 필수 string, query 없음.
- Request body: `points` (필수 array, Backend 허용 1~1000개 및 body 256 KiB 이하; FE는 최대 10개). 각 원소는 `pointId` (필수 string, IndexedDB point ID), `timestamp`, `lat`, `lng` (필수 number); `gpsSpeed`, `heading`, `accuracy` (number 또는 null). `gpsSpeed`는 **m/s**이고 UI 속도만 km/h다.
- Response 200: `pointsReceived`/`pointsStored` (필수 integer). 중복 `pointId`는 기존 기록을 유지해 `pointsStored`가 0일 수 있다. FE는 `pointsReceived`가 보낸 건수와 같을 때만 batch를 synced로 표시한다.
- 오류: `400 INVALID_REQUEST` — 잘못된 point; `404 TRIP_NOT_FOUND` — trip 없음 또는 key 불일치; `413` — 256 KiB 초과, JSON body 보장 없음. 응답 유실 시 같은 `pointId`와 `X-Trip-Key`를 재전송하므로 Backend는 point ID로 중복 제거한다.

## POST /api/trips/{tripId}/finish

- 설명: 남은 point 동기화 후 주행 종료. `X-Trip-Key` 헤더 필수. Path param `tripId` 필수 string, query 없음.
- Request body: `finishedAt` (필수 number), `actualDurationSeconds` (필수 number). null 불가.
- Response 204: 성공, body 없음. FE는 JSON body를 파싱하지 않는다.
- 오류: `400 INVALID_REQUEST` — 종료 입력 오류; `404 TRIP_NOT_FOUND` — trip 없음 또는 key 불일치; `503` — 서버 장애. 응답 유실 시 동일 종료 시각과 `X-Trip-Key`로 재시도하며 Backend는 이를 멱등 처리해야 한다.

## POST /api/trips/{tripId}/routes

- 설명: 주행 중 재탐색으로 생성된 route ID를 Trip에 연결한다. `X-Trip-Key` 헤더 필수. 초기 route ID는 Trip 생성 본문에 이미 포함한다.
- Request body: `routeId` (필수 nonblank string), `occurredAt` (필수 0 이상 Unix epoch milliseconds, Trip 시작 이후).
- Response 204: 본문 없음. 같은 route ID와 key 재전송은 기존 시각을 보존하고 204다. 응답을 못 받았어도 저장된 같은 값으로 재시도한다.
- 오류: `400 INVALID_REQUEST` — 필드·시각 오류; `404 TRIP_NOT_FOUND` — Trip 없음 또는 key 불일치.

## 외부 연동 및 실패 경계

- TMAP API 연동과 키는 필요하지 않다. 사용자가 별도 TMAP 앱의 ETA·거리를 선택적으로 입력한다. FE는 Engine `:8090`/`/internal/*`에 직접 접속하지 않는다.
- 온라인 이벤트와 5초 주기 동기화가 local trip 생성 → point batch → finish 순서로 재시도한다. 업로드 성공 후에만 point를 synced로 변경한다.
- 평상시 지도에도 `trafficLevel`별 정체 빨강·서행 주황·원활 초록·정보 없음 회색 선과 범례를 표시한다. `geometryStartIndex`~`geometryEndIndex`가 edge의 전체 좌표 범위다. 매핑되지 않거나 겹친 선분은 UNKNOWN이며 이전 snapshot처럼 범위가 없으면 경로 전체를 UNKNOWN으로 표시한다. `trafficSource=UNKNOWN`도 전체 선을 UNKNOWN으로 표시한다. 경로·주행 ETA 가까이에 관측 범위 또는 실시간 교통 미반영을 안내하고, JSON source는 개발용 교통 데이터로 구분한다. Debug에서는 선을 눌러 속도와 attribution을 조회한다.
- FE는 GPS를 경로 선분에 투영해 남은 거리와 다음 `instructions` 지점까지의 거리를 표시한다. Backend는 via-node 제한 일부를 경로에 반영하지만 안내는 geometry 기반 시각 힌트이며 via-way·조건부 제한·차로 정보의 안전성을 보증하지 않는다.
