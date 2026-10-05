import { ApiError, getJson } from './httpClient.ts';
import type { Coordinate } from '../types/navigation';

export interface PlaceResult { id: string; name: string; address: string; coordinate: Coordinate }
export interface PlaceSearchResponse { places: PlaceResult[]; source: 'JSON' | 'NAVER' }

/** Search uses Edge only; Naver credentials and upstream responses stay on the server. */
export async function searchPlaces(query: string): Promise<PlaceSearchResponse> {
  const normalized = query.trim();
  if (normalized.length < 2 || normalized.length > 80) throw new Error('INVALID_QUERY');
  const response = await getJson<PlaceSearchResponse>(`/places?query=${encodeURIComponent(normalized)}`);
  if (!response || !['JSON', 'NAVER'].includes(response.source) || !Array.isArray(response.places)
    || response.places.length > 5
    || !response.places.every((place) => typeof place.id === 'string' && place.id.length > 0
      && typeof place.name === 'string' && place.name.length > 0 && typeof place.address === 'string'
      && Number.isFinite(place.coordinate?.lat) && Math.abs(place.coordinate.lat) <= 90
      && Number.isFinite(place.coordinate?.lng) && Math.abs(place.coordinate.lng) <= 180)) {
    throw new Error('INVALID_PLACE_RESPONSE');
  }
  return response;
}

export function placeSearchErrorMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 503) return '장소 검색을 사용할 수 없습니다. 지도나 좌표로 목적지를 선택해주세요.';
  if (failure instanceof ApiError && failure.status === 400) return '검색어를 확인해주세요.';
  if (failure instanceof Error && failure.message === 'INVALID_QUERY') return '건물명이나 지명을 2자 이상 입력해주세요.';
  return '장소 검색에 실패했습니다. 다시 시도해주세요.';
}
