# 로컬 저장소 스키마

Backend DB schema는 이 FE 저장소의 범위 밖이다. 브라우저 IndexedDB `k-nav-trips` **version 3**에 다음 object store를 둔다. 사이트 데이터를 삭제하면 로컬 기록을 복구할 수 없다.

## trips

- 목적/담당: 오프라인 trip 생성·종료 재시도. `gpsStore.ts`, `tripSync.ts`.
- Key path: `localId` (string, 주행 시작 시 생성한 UUID, 고유).
- Fields: `clientTripId` (string, 최초 UUID와 동일하며 재시도에도 불변), `serverId` (string|null), `routeId` (string), `algorithm` (enum `BASELINE`/`DIRECTION_AWARE`), `startedAt` (number, Unix ms), `origin`/`destination` (`{lat:number,lng:number}`), `ourEtaSeconds`/`ourDistanceMeters` (number, 출발 시점 OUR 계획값), `tmapEtaSeconds`/`tmapDistanceMeters` (number|null, 별도 TMAP 앱에서 수동 입력한 출발 시점 값), `finishedAt` (number|null), `syncedStart`/`syncedFinish` (boolean). 수동 값은 시작 후 갱신하지 않는다.
- 관계: 하나의 trip에 여러 point. trip 삭제 기능과 IndexedDB foreign key 강제는 없다.
- Migration v1/v2 → v3: 기존 `localId`를 `clientTripId`로 복사하고, 없는 algorithm은 `DIRECTION_AWARE`, 없는 OUR 시간·거리는 0, 없는 수동 TMAP 시간·거리는 null로 채운다. 미동기화 point와 ID는 유지한다.

## points

- 목적/담당: 업로드 성공 전 GPS 데이터 보존. `gpsStore.ts`, `tripSync.ts`.
- Key path: `id` (string, 고유 UUID). 서버 전송 시 동일 값을 `pointId`로 사용한다.
- Index: `tripId` (비고유, `trips.localId` 참조).
- Fields: `point` (`timestamp`, `latitude`, `longitude`는 number; `accuracy`, `speed`, `heading`은 number|null), `synced` (boolean, 초기 false). `point.speed`와 업로드 `gpsSpeed`의 단위는 **m/s**다.
- 관계: `trips.localId` → `points.tripId` 일대다. 업로드 성공 batch만 `synced=true`로 바뀐다.
- Migration: v2에서 point record와 ID를 수정하지 않는다. 향후 구조 변경 시 DB version을 증가시켜 `onupgradeneeded`에서 이전한다.
