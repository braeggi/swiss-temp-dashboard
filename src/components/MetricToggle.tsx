import type { Metric } from '../types';

const LABELS: Record<Metric, string> = {
  mean: 'Daily mean',
  max: 'Daily max',
  min: 'Daily min',
};

export interface MetricToggleProps {
  value: Metric;
  onChange: (m: Metric) => void;
}

export function MetricToggle({ value, onChange }: MetricToggleProps) {
  return (
    <div className="metric-toggle" role="group" aria-label="Temperature metric">
      {(Object.keys(LABELS) as Metric[]).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={m === value}
          className={m === value ? 'active' : ''}
          onClick={() => onChange(m)}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  );
}
