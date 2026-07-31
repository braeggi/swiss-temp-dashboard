import { THRESHOLDS, type ThresholdKey } from '../lib/thresholdDays';

export interface ThresholdToggleProps {
  value: ThresholdKey;
  onChange: (t: ThresholdKey) => void;
}

export function ThresholdToggle({ value, onChange }: ThresholdToggleProps) {
  return (
    <div className="threshold-toggle">
      <label id="threshold-label">Count</label>
      <div role="group" aria-labelledby="threshold-label" className="metric-toggle">
        {THRESHOLDS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={t.key === value}
            className={t.key === value ? 'active' : ''}
            onClick={() => onChange(t.key)}
            title={t.short}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
