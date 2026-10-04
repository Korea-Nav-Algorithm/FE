import type { Coordinate } from '../types/navigation';

export interface DestinationPreset extends Coordinate { id: string; name: string }
export interface MapConfig { styleUrl: string; initialZoom: number }

// Coordinates: OpenStreetMap way 436075604, 효자길 39.
export const DESTINATIONS: DestinationPreset[] = [{ id: 'bundang-church', name: '분당중앙교회', lat: 37.37709, lng: 127.13973 }];
export const MAP_CONFIG: MapConfig = { styleUrl: import.meta.env?.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty', initialZoom: 15 };
export const NAVIGATION_CONFIG = { poorAccuracyMeters: 60, rerouteDistanceMeters: 80, rerouteConsecutivePoints: 3, arrivalDistanceMeters: 50, arrivalHoldMilliseconds: 8000, pointIntervalMilliseconds: 900, uploadBatchSize: 10 } as const;
