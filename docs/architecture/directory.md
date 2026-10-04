# 디렉토리 구조

| 경로 | 역할 |
| --- | --- |
| `src/App.tsx` | 단일 화면 조립과 표시 전용 UI |
| `src/features/navigation/components/NavigationMap.tsx` | MapLibre 지도, marker, route 및 debug 구간 layer |
| `src/features/navigation/hooks/useNavigation.ts` | GPS, 경로, 주행 상태 전이와 UI 상태 |
| `src/features/navigation/services/config.ts` | 목적지·지도·임계값 설정 |
| `src/features/navigation/services/geolocation.ts` | Geolocation watch adapter |
| `src/features/navigation/services/geo.ts` | 거리·속도·경로 이탈 계산 |
| `src/features/navigation/services/providers.ts` | Mock/실제 RouteProvider |
| `src/features/navigation/services/httpClient.ts` | 동일 origin API 호출, timeout 및 오류 코드 변환 |
| `src/features/navigation/services/apiPayloads.ts` | 저장된 Trip/point ID를 요청 DTO로 변환 |
| `src/features/navigation/services/routeValidation.ts` | 정상/zero-distance route 검증 |
| `src/features/navigation/services/gpsStore.ts` | IndexedDB 저장소 |
| `src/features/navigation/services/tripSync.ts` | 주행 생성·기록·업로드·종료 동기화 |
| `src/features/navigation/hooks/useScreenWakeLock.ts` | 주행 중 화면 켜짐 요청과 해제 |
| `src/features/navigation/types/navigation.ts` | GPS, route, trip, 저장 모델 |
| `docs/api` | Backend 요구 계약 |
