/** Half-widths offered in the UI. 0 means the single calendar day. */
export const WINDOW_CHOICES = [0, 3, 7] as const;

export type WindowDays = (typeof WINDOW_CHOICES)[number];

export const isWindowDays = (n: number): n is WindowDays =>
  (WINDOW_CHOICES as readonly number[]).includes(n);

const LABELS: Record<WindowDays, string> = {
  0: 'Single day',
  3: '±3 days',
  7: '±7 days',
};

export interface WindowToggleProps {
  value: WindowDays;
  onChange: (w: WindowDays) => void;
  /**
   * Open-Meteo places are fetched one calendar day at a time, so there are no
   * neighbouring days to average. Disabled rather than silently ignored.
   */
  disabled?: boolean;
}

export function WindowToggle({ value, onChange, disabled = false }: WindowToggleProps) {
  return (
    <div className="window-toggle">
      <label id="window-label">Averaging</label>
      <div role="group" aria-labelledby="window-label" className="metric-toggle">
        {WINDOW_CHOICES.map((w) => (
          <button
            key={w}
            type="button"
            disabled={disabled}
            aria-pressed={w === value}
            className={w === value ? 'active' : ''}
            onClick={() => onChange(w)}
          >
            {LABELS[w]}
          </button>
        ))}
      </div>
    </div>
  );
}
