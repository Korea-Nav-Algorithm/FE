import { trafficLabels } from '../services/routeTraffic';

export function TrafficLegend() {
  return <div className="traffic-legend" aria-label="경로 교통 상태 범례">
    {(['CONGESTED', 'SLOW', 'FREE', 'UNKNOWN'] as const).map((level) =>
      <span key={level}><i className={`traffic-key traffic-${level.toLowerCase()}`} />{trafficLabels[level]}</span>)}
  </div>;
}
