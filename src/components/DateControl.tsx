import { isIsoDate } from '../lib/dateUtil';

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
  return (
    <div className="date-control">
      <label htmlFor="date">Day</label>
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
      {value !== today && (
        <button type="button" onClick={() => onChange(today)}>
          Back to today
        </button>
      )}
    </div>
  );
}
