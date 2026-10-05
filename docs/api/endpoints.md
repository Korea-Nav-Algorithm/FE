# Frontend가 사용하는 Edge 엔드포인트

이 저장소는 FE이며 아래 경로는 현재 화면과 동기화 흐름에서 호출하는 Edge API다. 프론트에는 HTTP handler가 없다.

| Method | URL | Auth | 설명 |
| --- | --- | --- | --- |
| POST | /api/routes | 없음 | OUR 경로 계산 |
| GET | /api/places | 없음 | 건물·지명 검색 |
| GET | /api/routes/{routeId} | 없음 | 저장된 OUR 경로 복원 |
| POST | /api/trips | 없음 | 주행 생성 |
| POST | /api/trips/{tripId}/points | Trip key | GPS point batch 저장 |
| POST | /api/trips/{tripId}/routes | Trip key | 재탐색 route ID 저장 |
| POST | /api/trips/{tripId}/finish | Trip key | 주행 종료 |
