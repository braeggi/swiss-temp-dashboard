export const VIEWS = ['day', 'year', 'threshold'] as const;

export type ViewMode = (typeof VIEWS)[number];

export const isViewMode = (s: string): s is ViewMode => (VIEWS as readonly string[]).includes(s);

const LABELS: Record<ViewMode, string> = {
  day: 'This day',
  year: 'Whole year',
  threshold: 'Hot & cold days',
};

export interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  /** Open-Meteo places are fetched one day at a time, so there is no year to draw. */
  disabled?: boolean;
}

export function ViewToggle({ value, onChange, disabled = false }: ViewToggleProps) {
  return (
    <div className="view-toggle">
      <label id="view-label">View</label>
      <div role="group" aria-labelledby="view-label" className="metric-toggle">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={v === value}
            className={v === value ? 'active' : ''}
            onClick={() => onChange(v)}
          >
            {LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}
