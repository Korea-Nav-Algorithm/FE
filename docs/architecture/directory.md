# 디렉토리 구조

| 경로 | 역할 |
| --- | --- |
| `src/App.tsx` | 단일 화면 조립과 표시 전용 UI |
| `src/features/navigation/components/NavigationMap.tsx` | MapLibre 지도, marker, route 및 교통 상태 구간 layer |
| `src/features/navigation/components/NavigationIcon.tsx` | 지도 버튼 및 기존 경로 안내용 SVG 아이콘 |
| `src/features/navigation/components/TrafficLegend.tsx` | 경로·주행 카드의 교통 색상 범례 |
| `src/features/navigation/hooks/useNavigation.ts` | GPS, 경로, 주행 상태 전이와 UI 상태 |
| `src/features/navigation/services/config.ts` | 목적지·지도·임계값 설정 |
| `src/features/navigation/services/geolocation.ts` | Geolocation watch adapter |
| `src/features/navigation/services/geo.ts` | 거리·속도·경로 이탈 계산 |
| `src/features/navigation/services/routeProgress.ts` | GPS의 경로 선분 투영과 다음 안내 선택 |
| `src/features/navigation/services/routeTraffic.ts` | 교통 상태별 선 기하와 범례 데이터 |
| `src/features/navigation/services/placeSearch.ts` | Edge 장소 검색 계약·응답 검증·오류 메시지 |
| `src/features/navigation/services/providers.ts` | Mock/실제 RouteProvider |
| `src/features/navigation/services/httpClient.ts` | 동일 origin API 호출, timeout 및 오류 코드 변환 |
| `src/features/navigation/services/apiPayloads.ts` | 저장된 Trip/point ID를 요청 DTO로 변환 |
| `src/features/navigation/services/routeValidation.ts` | 정상/zero-distance route 검증 |
| `src/features/navigation/services/gpsStore.ts` | IndexedDB 저장소 |
| `src/features/navigation/services/tripSync.ts` | 주행 생성·기록·업로드·종료 동기화 |
| `src/features/navigation/hooks/useScreenWakeLock.ts` | 주행 중 화면 켜짐 요청과 해제 |
| `src/features/navigation/types/navigation.ts` | GPS, route, trip, 저장 모델 |
| `docs/api` | Backend 요구 계약 |
