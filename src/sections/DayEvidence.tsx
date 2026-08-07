import type { DayPoint, Metric } from '../types';
import { DateControl } from '../components/DateControl';
import { MetricToggle } from '../components/MetricToggle';
import { WindowToggle, type WindowDays } from '../components/WindowToggle';
import { DayAcrossYearsChart } from '../components/DayAcrossYearsChart';

export interface DayEvidenceProps {
  date: string;
  today: string;
  onDateChange: (iso: string) => void;
  metric: Metric;
  onMetricChange: (m: Metric) => void;
  windowDays: WindowDays;
  onWindowChange: (w: WindowDays) => void;
  /** Disabled for a geocoded place: Open-Meteo is fetched one day at a time. */
  windowDisabled: boolean;
  points: DayPoint[];
  dateLabel: string;
  todayValue: number | null;
  todayYear: number;
  homogenised: boolean;
  norm: number | null;
}

export default function DayEvidence({
  date, today, onDateChange, metric, onMetricChange,
  windowDays, onWindowChange, windowDisabled,
  points, dateLabel, todayValue, todayYear, homogenised, norm,
}: DayEvidenceProps) {
  return (
    <section className="evidence" id="evidence-day">
      <h2>How unusual is this?</h2>
      <div className="controls">
        <DateControl value={date} today={today} onChange={onDateChange} />
        <MetricToggle value={metric} onChange={onMetricChange} />
        <WindowToggle value={windowDays} onChange={onWindowChange} disabled={windowDisabled} />
      </div>
      <DayAcrossYearsChart
        points={points}
        metric={metric}
        dateLabel={dateLabel}
        todayValue={todayValue}
        todayYear={todayYear}
        homogenised={homogenised}
        windowDays={windowDisabled ? 0 : windowDays}
        norm={norm}
      />
    </section>
  );
}
