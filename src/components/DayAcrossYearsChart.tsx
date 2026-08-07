import {
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';
import type { DayPoint, Metric } from '../types';
import { trendSegment, withTodayPoint, yDomain } from '../lib/chartData';
import { trendPerCentury } from '../lib/series';

const METRIC_LABEL: Record<Metric, string> = {
  mean: 'Daily mean (°C)',
  max: 'Daily max (°C)',
  min: 'Daily min (°C)',
};

/** Axis-label form, without the unit — the tooltip prints the unit on the value. */
const METRIC_NAME: Record<Metric, string> = {
  mean: 'Daily mean',
  max: 'Daily max',
  min: 'Daily min',
};

/**
 * A 3px dot is impossible to hover — you have to land dead centre. Draw the thin
 * mark the design calls for, but wrap it in a transparent disc so the hit area
 * is roughly a pointer's worth of slack.
 */
function HitDot(props: { cx?: number; cy?: number; fill?: string }) {
  const { cx, cy, fill } = props;
  if (cx === undefined || cy === undefined) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill="transparent" />
      <circle cx={cx} cy={cy} r={3.5} fill={fill} fillOpacity={0.6} />
    </g>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: DayPoint }>;
  dateLabel: string;
  metric: Metric;
  todayYear: number;
  isTodayShown: boolean;
}

/**
 * A ScatterChart's tooltip payload carries BOTH axis dataKeys, so the default
 * rendering emits one row per axis and a single `formatter` is applied to each.
 * That printed the year as a temperature ("2026.0 °C"). Read the point off the
 * payload instead and render exactly one row, with the year in the heading.
 */
export function ChartTooltip({
  active,
  payload,
  dateLabel,
  metric,
  todayYear,
  isTodayShown,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point || typeof point.year !== 'number' || typeof point.value !== 'number') return null;

  const isToday = isTodayShown && point.year === todayYear;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-head">
        {dateLabel} {point.year}
        {isToday && <span className="chart-tooltip-today"> · today, so far</span>}
      </div>
      <div className="chart-tooltip-value">
        {METRIC_NAME[metric]} {point.value.toFixed(1)} °C
      </div>
    </div>
  );
}

export interface DayAcrossYearsChartProps {
  points: DayPoint[];
  metric: Metric;
  dateLabel: string;
  /**
   * The value to highlight, drawn as a distinct point. On today that is the
   * live reading in progress; on a past day it is that day's own year.
   */
  todayValue: number | null;
  todayYear: number;
  /**
   * Is the highlighted value today's reading in progress?
   *
   * False whenever a past day is in view, where the marker picks out a
   * completed year instead. The chart cannot work this out for itself — it is
   * handed a value and a year, and both look the same either way — so calling
   * the mark "today, so far" without being told states something untrue about
   * the data on every past date.
   */
  provisional: boolean;
  homogenised: boolean;
  /** Averaging half-width, for the caption. 0 = single calendar day. */
  windowDays?: number;
  /** 1991-2020 mean for this day, drawn as the reference the eye reads against. */
  norm?: number | null;
}

export function DayAcrossYearsChart({
  points,
  metric,
  dateLabel,
  todayValue,
  todayYear,
  provisional,
  homogenised,
  windowDays = 0,
  norm = null,
}: DayAcrossYearsChartProps) {
  const [showTable, setShowTable] = useState(false);
  if (points.length === 0) {
    return <p className="chart-empty">No data recorded for {dateLabel} at this station.</p>;
  }

  // The trend, the domain, the caption and the table all stay on `points` —
  // the completed record. Only the plotted series carries today's provisional
  // reading, so that the marker has something to hover.
  const seg = trendSegment(points);
  const perCentury = trendPerCentury(points);
  const domain = yDomain(points, todayValue === null ? [] : [todayValue]);
  const showsToday = todayValue !== null;
  const plotted = withTodayPoint(points, todayYear, todayValue);
  // A marker is drawn on every day; only on today is it a reading in progress.
  const marksToday = showsToday && provisional;

  return (
    <figure className="chart">
      <figcaption>
        {dateLabel} · {METRIC_LABEL[metric]} · {points.length} years
        {windowDays > 0 && <> · averaged over ±{windowDays} days</>}
      </figcaption>

      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 8, right: 68, bottom: 24, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            type="number"
            dataKey="year"
            domain={['dataMin - 1', 'dataMax + 1']}
            allowDecimals={false}
            tickCount={8}
            // Eight four-digit years do not fit a phone-width axis; without a
            // gap floor Recharts draws them anyway and they run together.
            minTickGap={28}
            name="Year"
          />
          <YAxis
            type="number"
            dataKey="value"
            domain={domain}
            tickFormatter={(v: number) => `${v}°`}
            name={METRIC_LABEL[metric]}
          />
          <Tooltip
            cursor={{ stroke: 'var(--axis)' }}
            content={
              <ChartTooltip
                dateLabel={dateLabel}
                metric={metric}
                todayYear={todayYear}
                isTodayShown={marksToday}
              />
            }
          />

          {norm !== null && (
            <ReferenceLine
              y={norm}
              stroke="var(--axis)"
              strokeWidth={1}
              strokeDasharray="4 3"
              label={{
                // Right-hand end, above the line: the left edge is the densest
                // part of a warming series, and insideTopLeft collided with both
                // the dots and the trend line.
                value: `normal ${norm.toFixed(1)}°`,
                position: 'right',
                fill: 'var(--muted)',
                fontSize: 11,
              }}
            />
          )}

          {seg && (
            <ReferenceLine
              segment={[seg.from, seg.to]}
              stroke="currentColor"
              strokeWidth={2}
              strokeOpacity={0.5}
              ifOverflow="extendDomain"
            />
          )}

          <Scatter
            name="Past years"
            data={plotted}
            fill="currentColor"
            shape={<HitDot />}
            isAnimationActive={false}
          />
          {/* ReferenceDot, not a second Scatter: a Scatter with its own
              one-element data array renders at the plot origin rather than at
              its data coordinates, so the marker appeared in the top-left
              corner just outside the plot. A ReferenceDot is placed by explicit
              coordinates. The background-coloured ring keeps it readable
              against the dot cloud. */}
          {todayValue !== null && (
            <ReferenceDot
              x={todayYear}
              y={todayValue}
              r={7}
              fill="var(--warm)"
              stroke="var(--bg)"
              strokeWidth={2.5}
              className="today-point"
              isFront
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>

      <div className="chart-foot">
        <ul className="chart-key">
          <li>
            <svg width="18" height="12" aria-hidden="true">
              <circle cx="9" cy="6" r="3.5" fill="currentColor" fillOpacity={0.6} />
            </svg>
            <span>Past years</span>
          </li>
          {showsToday && (
            <li>
              <svg width="18" height="12" aria-hidden="true">
                <circle cx="9" cy="6" r="5" fill="var(--warm)" stroke="var(--bg)" strokeWidth="2" />
              </svg>
              {/* The key has to name what the mark actually is. On a past day
                  that is a finished year, so it takes the year as its label. */}
              <span>{marksToday ? 'Today, so far' : todayYear}</span>
            </li>
          )}
        </ul>
        <button
          type="button"
          className="link-button"
          aria-expanded={showTable}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'Hide table' : 'Show table'}
        </button>
      </div>

      {showTable && (
        <div className="table-scroll">
          <table className="data-table">
            <caption>
              {dateLabel} · {METRIC_LABEL[metric]}, every year on record
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">{METRIC_NAME[metric]}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.year}>
                  <th scope="row">{p.year}</th>
                  <td>{p.value.toFixed(1)} °C</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="chart-trend">
        {perCentury === null ? (
          <>Trend not shown — fewer than 30 years of record.</>
        ) : (
          <>
            Trend {perCentury >= 0 ? '+' : '−'}
            {Math.abs(perCentury).toFixed(1)} °C per century
            {!homogenised && <> · raw series, not homogenised</>}
          </>
        )}
      </p>
    </figure>
  );
}
