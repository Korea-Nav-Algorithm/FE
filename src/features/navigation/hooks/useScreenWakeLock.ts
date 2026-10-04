import { useEffect, useState } from 'react';

export type WakeLockStatus = 'INACTIVE' | 'ACTIVE' | 'UNSUPPORTED' | 'FAILED';

/** A visibility loss releases the sentinel; reacquire only while driving. */
export function useScreenWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('INACTIVE');

  useEffect(() => {
    if (!active) return;
    if (!navigator.wakeLock) { setStatus('UNSUPPORTED'); return; }
    let stopped = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible' || sentinel) return;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (stopped) { await acquired.release(); return; }
        sentinel = acquired;
        setStatus('ACTIVE');
        acquired.addEventListener('release', () => {
          if (sentinel === acquired) sentinel = null;
          if (!stopped) setStatus('FAILED');
        });
      } catch { if (!stopped) setStatus('FAILED'); }
    };

    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void acquire();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (sentinel) void sentinel.release();
    };
  }, [active]);

  return active ? status : 'INACTIVE';
}
