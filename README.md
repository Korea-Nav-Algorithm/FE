# K-Nav Navigation Test Client

모바일 웹 Navigation 클라이언트입니다. GPS, 목적지, 경로, 화면 안내, 주행 기록, 오프라인 재전송을 사용합니다. 계정 로그인은 없고 각 Trip의 기기 비밀키로 GPS 기록을 보호합니다. Mock 경로는 **직선**이므로 도로 주행 안내에 사용하면 안 됩니다. 실제 OSM 경로도 via-way·조건부 회전 제한, 차로·음성 안내 및 현장 검증 전에는 운전 지시로 사용하지 마세요.

구현 범위와 검증 상태는 [구현 현황](docs/implementation.md)에 정리했습니다.

## 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell에서는 `Copy-Item .env.example .env.local`을 사용합니다. 정적 빌드는 `npm run build`, 검사는 `npm run lint`와 `npm test`입니다.

## 환경변수

| 이름 | 예시 | 용도 |
| --- | --- | --- |
| `VITE_USE_MOCK_API` | `false` | 기본값은 실제 Edge API. 로컬 개발에서만 명시적으로 `true`로 변경해 Mock 사용. Production build에서 `true`이면 빌드 실패. |
| `VITE_DEV_API_TARGET` | `http://localhost:8080` | Vite 개발 프록시 대상. 배포 번들에는 포함되지 않음. |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | MapLibre 스타일 URL. 제공자 교체 시 변경. |

Backend Compose의 `EDGE_HOST_PORT`가 기본 8080이 아니라면 `.env.local`의 `VITE_DEV_API_TARGET`을 해당 호스트 포트로 맞춥니다. 현재 로컬 Docker 기동의 28080 포트에는 `http://127.0.0.1:28080`을 사용합니다. 이 값은 Vite 개발 프록시에만 적용되며 운영 Frontend는 같은 출처의 `/api/*`를 호출합니다.

기본 스타일 URL은 [OpenFreeMap 공식 Quick Start](https://openfreemap.org/quick_start/)를 따릅니다. 분당중앙교회 preset은 [OpenStreetMap 기반 위치 정보](https://mapcarta.com/W436075604)의 효자길 39 중심 좌표를 사용합니다. 차량 진입 지점이 필요하면 실제 주행 전 지도에서 목적지를 직접 지정하세요.

TMAP은 API로 연동하지 않습니다. 실차 테스트 시 별도 TMAP 모바일 앱에서 같은 목적지의 추천 경로, ETA, 거리를 확인하고 수동 비교합니다. **TMAP API Key는 필요하지 않습니다.** 출발 전 DBG의 수동 벤치마크 영역에 TMAP 예상 시간(분)과 예상 거리(km)를 선택적으로 입력할 수 있습니다. 입력값은 Trip 시작 시 초·m 단위 스냅샷으로 저장되며, 비워도 주행할 수 있습니다. `VITE_` 변수는 브라우저 번들에 공개되므로 비밀 키를 넣지 마세요.

## Mock과 실제 API

Mock 모드는 로컬 개발에서 `.env.local`의 `VITE_USE_MOCK_API=true`로 명시적으로 켤 수 있습니다. GPS 권한만 있으면 목적지 선택 → 직선 경로 표시 → OUR ETA → 주행 시작 → GPS 저장 → 주행 종료를 실행합니다. 실제 테스트는 `false`로 두고 Edge Backend를 실행하세요. 개발 서버의 `/api`는 `VITE_DEV_API_TARGET`으로 프록시합니다. Production은 Mock 설정이 `true`이면 빌드가 실패하며, 브라우저는 항상 동일 출처의 `/api/*`만 요청합니다.

Debug(DBG)에서 `BASELINE`과 `DIRECTION_AWARE`를 선택할 수 있습니다. 주행 중에는 선택을 잠그며, OUR ETA와 route ID를 확인하세요. 수동 TMAP 입력은 경로 준비 후 주행 시작 전 DBG에서만 가능합니다.

OUR 경로 응답의 `instructions`에서 다음 회전 방향과 남은 거리를 화면에 표시합니다. GPS를 경로 선분에 투영해 남은 거리와 진행 상태를 계산하고, geometry와 구간이 정렬되면 각 구간 `effectiveSpeed`로 남은 ETA를 추정합니다. Backend가 OSM via-node 회전 제한 일부를 경로에 반영하지만, 안내는 차로·조건부 제한·현장 교통을 검증하지 않은 시각 힌트입니다. 목적지 창에서 건물·지명 검색 결과를 선택하면 해당 좌표로 경로를 요청합니다. preset, 지도 터치, WGS84 위도·경도 입력도 사용할 수 있습니다. 기본 Backend 설정은 분당중앙교회 1건의 개발 목록이며, 일반 장소 검색에는 Backend의 Naver Search API Client ID·Secret 설정이 필요합니다.

경로 선은 관측 교통 속도에 따라 정체 빨강·서행 주황·원활 초록으로 표시합니다. 관측값이나 신뢰할 수 있는 geometry 매핑이 없거나 `trafficSource=UNKNOWN`이면 회색 **정보 없음**입니다. 경로·주행 ETA 아래에 관측 범위와 `JSON` 개발 데이터 여부를 표시합니다. 관측이 없으면 “실시간 교통 미반영 · 기본 속도 기준 예상시간”이라고 안내합니다. Backend의 미관측 도로 ETA는 기본 속도에 계획 계수(초기값 0.75)를 적용한 추정치이므로 실차 소요시간과 차이가 날 수 있습니다.

## 모바일 GPS 테스트

Geolocation은 HTTPS 보안 컨텍스트 또는 `localhost`에서만 동작합니다. 휴대폰에서 LAN IP로 Vite 개발 서버를 접속할 때는 HTTPS 프록시/터널을 사용하세요. 브라우저 위치 권한을 허용하고, 화면이 잠기지 않도록 유지한 뒤 실제 GPS 수신을 확인하세요. DevTools 위치 시뮬레이션으로 좌표·속도 UI를 확인할 수 있지만 실제 차량 GPS 품질과 백그라운드 수집은 기기에서 검증해야 합니다. 모바일 브라우저가 백그라운드에서 위치 콜백을 중단할 수 있으므로 테스트 중 화면을 켜 두세요.

네트워크 장애 확인은 주행 중 DevTools를 Offline으로 바꾸고 DBG의 `Pending sync` 증가를 본 뒤 Online으로 복구하여 감소를 확인합니다. 기록은 IndexedDB에 먼저 저장합니다. 사이트 데이터를 삭제하거나 브라우저 저장소가 손상되면 복구할 수 없습니다.

실차 전 스마트폰에서 다음 순서로 점검하세요.

1. HTTPS 페이지에서 위치 권한을 허용하고 DBG의 GPS 좌표·정확도·point 수가 갱신되는지 확인합니다.
2. 분당중앙교회를 선택해 OUR route ID/ETA를 확인합니다. 별도 TMAP 앱에서 동일 목적지를 검색하고, 원하면 DBG에 수동 ETA·거리를 입력합니다. Debug에서 필요한 algorithm을 선택합니다.
3. 주행 시작 후 DBG의 Client/Server trip ID, GPS point 수, `API trip create`와 `API GPS batch` 상태를 확인합니다.
4. 네트워크를 끊은 상태에서 point·Pending sync가 증가하고, 복구 뒤 Pending sync가 감소하는지 확인합니다.
5. 주행 종료 후 `API finish: SYNCED`를 확인합니다. 실제 차량에서는 운전자가 아닌 동승자가 이 점검을 수행하세요.

지원 기기에서는 주행 중 Screen Wake Lock을 요청합니다. DBG의 `Wake Lock` 상태를 확인하세요. 브라우저가 거부하거나 지원하지 않아도 GPS 기록 화면은 동작하지만, 화면 잠금 뒤의 위치 수집은 보장되지 않습니다. [W3C Screen Wake Lock 명세](https://www.w3.org/TR/screen-wake-lock/)에 따라 비가시 상태에서 잠금이 해제될 수 있습니다.

## Production 배포 준비

```bash
npm ci
npm run build
```

빌드 산출물은 `dist/`입니다. Nginx가 HTTPS로 정적 파일을 제공하고 같은 origin의 `/api/*`를 Edge로 전달하도록 설정합니다. 앱은 단일 `/` 화면이며 클라이언트 라우터가 없어 별도 history fallback 경로는 현재 필요하지 않습니다. Frontend에서는 TLS 인증서와 Backend secret을 보관하지 않습니다. Production build 전에 `VITE_USE_MOCK_API=false`인지 확인하세요.

## 주요 구조

- `src/features/navigation/components`: 지도와 경로·주행·디버그 화면
- `src/features/navigation/hooks`: 위치 수신, 경로, 상태 전이 orchestration
- `src/features/navigation/services`: GPS 수학, Map 설정, API adapters, IndexedDB, 재전송
- `src/features/navigation/types`: 도메인 및 저장 모델
- `docs/api`: Backend가 구현해야 할 계약

## 사용하는 Edge API

- `POST /api/routes`: OUR 경로와 ETA, polyline 좌표 반환
- `GET /api/places?query=...`: Edge가 건물·지명을 검색하고 선택 가능한 좌표 반환
- `GET /api/routes/{routeId}`: 재접속 후 저장된 경로 복원
- `POST /api/trips`: 주행 생성, `tripId` 반환
- `POST /api/trips/{tripId}/points`: GPS point batch 저장
- `POST /api/trips/{tripId}/routes`: 주행 중 재탐색 route ID 저장
- `POST /api/trips/{tripId}/finish`: 주행 종료

상세 요청·응답 필드는 [API 명세](docs/api/specification.md)에 있습니다. Trip 생성은 영구 `clientTripId`와 32바이트 난수의 `accessKey`, GPS batch는 영구 `pointId`로 재시도합니다. 비밀키는 첫 요청 전에 IndexedDB에 보존하고 GPS·종료 요청의 `X-Trip-Key` 헤더에 사용합니다. GPS batch의 `pointsReceived`가 요청 건수와 같아야 로컬 point를 동기화 완료로 표시합니다. 임시 local trip은 네트워크 복구 후 생성·업로드됩니다. 브라우저 사이트 데이터가 삭제되면 Trip 비밀키를 복원할 수 없습니다.
