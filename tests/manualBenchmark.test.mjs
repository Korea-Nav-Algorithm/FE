import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManualBenchmark } from '../src/features/navigation/services/manualBenchmark.ts';

test('manual TMAP benchmark is optional and converts display units', () => {
  assert.deepEqual(parseManualBenchmark('', ''), { tmapEtaSeconds: null, tmapDistanceMeters: null });
  assert.deepEqual(parseManualBenchmark('31', ''), { tmapEtaSeconds: 1860, tmapDistanceMeters: null });
  assert.deepEqual(parseManualBenchmark('31', '18.4'), { tmapEtaSeconds: 1860, tmapDistanceMeters: 18400 });
});

test('manual TMAP benchmark rejects invalid negative or nonnumeric input', () => {
  assert.throws(() => parseManualBenchmark('-1', ''), /0 이상/);
  assert.throws(() => parseManualBenchmark('', '-0.5'), /0 이상/);
  assert.throws(() => parseManualBenchmark('NaN', ''), /0 이상/);
});
