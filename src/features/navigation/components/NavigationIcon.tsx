import type { ManeuverType } from '../types/navigation';

const paths = {
  search: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  locate: 'M12 2v3m0 14v3M2 12h3m14 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  back: 'm15 5-7 7 7 7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  drive: 'M5 17H3v-6l2-6h14l2 6v6h-2M5 17h14M5 11h14M6 14h1m10 0h1M5 17v3m14-3v3',
} as const;

/** Shared stroke icons keep navigation controls legible without an icon dependency. */
export function NavigationIcon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

/** Direction is a visual rendering of the existing Backend maneuver, not a new instruction. */
export function ManeuverIcon({ maneuver }: { maneuver?: ManeuverType }) {
  const left = maneuver === 'TURN_LEFT' || maneuver === 'SLIGHT_LEFT';
  const turn = left || maneuver === 'TURN_RIGHT' || maneuver === 'SLIGHT_RIGHT';
  const slight = maneuver === 'SLIGHT_LEFT' || maneuver === 'SLIGHT_RIGHT';
  const path = maneuver === 'U_TURN' ? 'M17 20V9a5 5 0 0 0-10 0v7m-4-4 4 4 4-4'
    : maneuver === 'ARRIVE' ? 'M5 22V3h14l-3 4 3 4H5'
      : slight ? 'M7 21v-8l11-10m-8 0h8v8'
        : turn ? 'M8 21V10h12m-6-6 6 6-6 6' : 'M12 21V3M5 10l7-7 7 7';
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={left ? { transform: 'scaleX(-1)' } : undefined}><path d={path} /></svg>;
}
