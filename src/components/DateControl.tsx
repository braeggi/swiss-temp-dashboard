import { isIsoDate, shiftDay } from '../lib/dateUtil';

/** Never let the user ask for a day that has not happened yet. */
export function clampDate(iso: string, today: string): string {
  return iso > today ? today : iso;
}

export interface DateControlProps {
  value: string; // YYYY-MM-DD
  today: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
}

export function DateControl({ value, today, onChange }: DateControlProps) {
  // Stepping forward off today is the one move the picker itself already
  // forbids via `max`, so the button says so rather than silently clamping.
  const atToday = value >= today;

  return (
    <div className="date-control">
      <label htmlFor="date">Day</label>
      <div className="date-stepper">
        <button
          type="button"
          className="date-step"
          aria-label="Previous day"
          onClick={() => onChange(shiftDay(value, -1))}
        >
          ←
        </button>
        <input
          id="date"
          type="date"
          value={value}
          max={today}
          onChange={(e) => {
            const iso = e.target.value;
            // A cleared or in-progress edit reports as "" (or, in some browsers,
            // a partial value) — never a non-ISO string that happens to be a
            // real date. Leave the current selection alone rather than
            // propagate something `parseIso` downstream cannot handle.
            if (!isIsoDate(iso)) return;
            onChange(clampDate(iso, today));
          }}
        />
        <button
          type="button"
          className="date-step"
          aria-label="Next day"
          disabled={atToday}
          onClick={() => onChange(clampDate(shiftDay(value, 1), today))}
        >
          →
        </button>
        {value !== today && (
          <button type="button" className="date-reset" onClick={() => onChange(today)}>
            Back to today
          </button>
        )}
      </div>
    </div>
  );
}
