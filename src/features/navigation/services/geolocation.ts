import type { GpsPoint } from '../types/navigation';

/** Keeps a single high accuracy browser watch active during the page lifetime. */
export function watchLocation(onPoint: (point: GpsPoint) => void, onError: (message: string) => void): () => void {
  if (!navigator.geolocation) { onError('현재 위치를 확인할 수 없습니다.'); return () => {}; }
  const watchId = navigator.geolocation.watchPosition(
    (position) => onPoint({ timestamp: position.timestamp, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null, speed: position.coords.speed, heading: position.coords.heading }),
    (error) => onError(error.code === 1 ? '위치 권한이 필요합니다. 브라우저에서 위치 접근을 허용해주세요.' : '현재 위치를 확인할 수 없습니다.'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
