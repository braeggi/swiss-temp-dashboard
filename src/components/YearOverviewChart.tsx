import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot,
} from 'recharts';
import type { Metric } from '../types';
import { MONTH_OFFSET } from '../lib/packed';
import type { YearDay } from '../lib/yearOverview';
import { yearTally } from '../lib/yearOverview';

const METRIC_LABEL: Record<Metric, string> = {
  mean: 'Daily mean (°C)',
  max: 'Daily max (°C)',
  min: 'Daily min (°C)',
};

/** Widened from the codec's readonly literal tuple so Recharts can index it. */
const MONTH_TICKS: number[] = [...MONTH_OFFSET];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (n: number) => `${n.toFixed(1)} °C`;

/**
 * Single source of truth for the chart's ink, so the legend cannot drift away
 * from what is actually drawn. Both the Area/Line props below and the legend
 * swatches read these.
 */
const RECORD_OPACITY = 0.1;
const USUAL_OPACITY = 0.2;
const NORMAL_OPACITY = 0.45;

/** Stacked fills, mirroring how the bands overlay each other on the chart. */
function BandSwatch({ layers }: { layers: number[] }) {
  return (
    <svg width="22" height="12" aria-hidden="true" focusable="false">
      {layers.map((o, i) => (
        <rect key={i} width="22" height="12" fill="currentColor" fillOpacity={o} />
      ))}
    </svg>
  );
}

function LineSwatch({
  stroke,
  opacity,
  width,
  dot = false,
}: {
  stroke: string;
  opacity: number;
  width: number;
  /** Mirrors the live end-of-line marker on the chart. */
  dot?: boolean;
}) {
  return (
    <svg width="22" height="12" aria-hidden="true" focusable="false">
      <line
        x1="0"
        y1="6"
        x2={dot ? 15 : 22}
        y2="6"
        stroke={stroke}
        strokeOpacity={opacity}
        strokeWidth={width}
      />
      {dot && <circle cx="18" cy="6" r="3.5" fill={stroke} />}
    </svg>
  );
}

interface Row {
  slot: number;
  /** Recharts draws a band when the value is a [low, high] pair. */
  record: [number, number] | null;
  usual: [number, number] | null;
  normal: number | null;
  current: number | null;
}

interface YearTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
  days: YearDay[];
  year: number;
}

function YearTooltip({ active, payload, days, year }: YearTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const d = days[row.slot];
  if (!d) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-head">
        {d.day} {MONTHS[d.month - 1]}
        {d.years > 0 && <> · {d.years} years</>}
      </div>
      {d.current !== null && (
        <div className="chart-tooltip-value">
          {year} {fmt(d.current)}
        </div>
      )}
      {d.normal !== null && <div>Normal {fmt(d.normal)}</div>}
      {d.recordMin !== null && d.recordMax !== null && (
        <div className="chart-tooltip-head">
          Record {fmt(d.recordMin)} … {fmt(d.recordMax)}
        </div>
      )}
    </div>
  );
}

export interface YearOverviewChartProps {
  days: YearDay[];
  metric: Metric;
  year: number;
  /** False for a raw SMN series, so the caption can say so. */
  homogenised: boolean;
}

export function YearOverviewChart({ days, metric, year, homogenised }: YearOverviewChartProps) {
  const withData = days.filter((d) => d.years > 0);
  if (withData.length === 0) {
    return <p className="chart-empty">No yearly record available for this station.</p>;
  }

  const lastWithData = [...days].reverse().find((d) => d.current !== null);

  const rows: Row[] = days.map((d) => ({
    slot: d.slot,
    record: d.recordMin !== null && d.recordMax !== null ? [d.recordMin, d.recordMax] : null,
    usual: d.p10 !== null && d.p90 !== null ? [d.p10, d.p90] : null,
    normal: d.normal,
    current: d.current,
  }));

  // Set the y-domain explicitly from the widest band. Left to Recharts, the
  // end-of-line Scatter drives the domain and the record band gets clipped —
  // the axis collapsed to roughly the current year's own range.
  const lows = withData.map((d) => d.recordMin as number);
  const highs = withData.map((d) => d.recordMax as number);
  const yDomain: [number, number] = [
    Math.floor(Math.min(...lows) - 1),
    Math.ceil(Math.max(...highs) + 1),
  ];

  const tally = yearTally(days);
  const span = `${Math.min(...withData.map((d) => d.years))}–${Math.max(
    ...withData.map((d) => d.years),
  )}`;

  return (
    <figure className="chart">
      <figcaption>
        {year} against the record · {METRIC_LABEL[metric]} · {span} years per day
        {!homogenised && <> · raw series, not homogenised</>}
      </figcaption>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            type="number"
            dataKey="slot"
            domain={[0, 365]}
            ticks={MONTH_TICKS}
            tickFormatter={(s: number) => MONTHS[MONTH_TICKS.indexOf(s)] ?? ''}
          />
          <YAxis type="number" domain={yDomain} tickFormatter={(v: number) => `${v}°`} />
          <Tooltip
            cursor={{ stroke: 'var(--axis)' }}
            content={<YearTooltip days={days} year={year} />}
          />

          {/* Widest band first so the narrower one reads on top of it. */}
          <Area
            dataKey="record"
            stroke="none"
            fill="currentColor"
            fillOpacity={RECORD_OPACITY}
            isAnimationActive={false}
            connectNulls
          />
          <Area
            dataKey="usual"
            stroke="none"
            fill="currentColor"
            fillOpacity={USUAL_OPACITY}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="normal"
            stroke="currentColor"
            strokeOpacity={NORMAL_OPACITY}
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="current"
            stroke="var(--accent)"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          {/* ReferenceDot, not Scatter: a Scatter series takes its x position
              from the row index after Recharts drops null entries, so a single
              marker among 365 nulls collapses to the far left of the plot. A
              ReferenceDot is placed by explicit data coordinates.
              The background-coloured ring separates it from the same-coloured
              line it terminates — without it the dot reads as an end cap. */}
          {lastWithData !== undefined && lastWithData.current !== null && (
            <ReferenceDot
              x={lastWithData.slot}
              y={lastWithData.current}
              r={6}
              fill="var(--accent)"
              stroke="var(--bg)"
              strokeWidth={2.5}
              className="today-point"
              isFront
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="chart-trend">
        {tally.withData === 0 ? (
          <>No readings yet for {year}.</>
        ) : (
          <>
            {year} so far: {tally.withData} days recorded · {tally.aboveP90} above the usual
            range, {tally.belowP10} below
            {tally.recordHigh > 0 && <> · {tally.recordHigh} at an all-time high</>}
            {tally.recordLow > 0 && <> · {tally.recordLow} at an all-time low</>}
          </>
        )}
      </p>

      <ul className="chart-key">
        <li>
          <BandSwatch layers={[RECORD_OPACITY]} />
          <span>
            Full recorded range
            <em>coldest to warmest ever measured on that date</em>
          </span>
        </li>
        <li>
          {/* Two layers, because on the chart the usual band sits on top of the
              record band and the fills add up. A single-layer swatch would show
              a lighter grey than the chart actually draws. */}
          <BandSwatch layers={[RECORD_OPACITY, USUAL_OPACITY]} />
          <span>
            Usual range
            <em>middle 80 % of years — 1 in 10 fell outside on either side</em>
          </span>
        </li>
        <li>
          <LineSwatch stroke="currentColor" opacity={NORMAL_OPACITY} width={1} />
          <span>
            Average
            <em>mean of every year on that date</em>
          </span>
        </li>
        <li>
          <LineSwatch stroke="var(--accent)" opacity={1} width={1.75} dot />
          <span>
            {year}
            <em>
              {tally.withData} days recorded
              {lastWithData !== undefined && (
                <> · latest {lastWithData.day} {MONTHS[lastWithData.month - 1]}</>
              )}
            </em>
          </span>
        </li>
      </ul>
    </figure>
  );
}
