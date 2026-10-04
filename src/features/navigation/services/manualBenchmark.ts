export interface ManualBenchmark { tmapEtaSeconds: number | null; tmapDistanceMeters: number | null }

function parseNonnegative(value: string, label: string): number | null {
  if (value.trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}은 0 이상의 숫자로 입력해주세요.`);
  return number;
}

/** Convert values copied from the separate TMAP app into a start-time snapshot. */
export function parseManualBenchmark(minutes: string, kilometers: string): ManualBenchmark {
  const etaMinutes = parseNonnegative(minutes, 'TMAP 예상 시간');
  const distanceKilometers = parseNonnegative(kilometers, 'TMAP 예상 거리');
  return {
    tmapEtaSeconds: etaMinutes === null ? null : Math.round(etaMinutes * 60),
    tmapDistanceMeters: distanceKilometers === null ? null : Math.round(distanceKilometers * 1000),
  };
}
