import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  THRESHOLDS,
  byDecade,
  decadeChange,
  type ThresholdKey,
  type ThresholdYear,
} from '../lib/thresholdDays';
import { trendSegment } from '../lib/chartData';

interface Row {
  year: number;
  count: number | null;
}

interface ThresholdTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
  rows: ThresholdYear[];
  /**
   * Deliberately NOT called `label`: Recharts injects its own `label` prop into
   * a Tooltip `content` element — the axis value, a number here — which
   * silently overrode ours and threw on `.toLowerCase()`.
   */
  thresholdLabel: string;
}

function ThresholdTooltip({ active, payload, rows, thresholdLabel }: ThresholdTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const full = rows.find((r) => r.year === row.year);
  if (!full) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-head">{full.year}</div>
      {full.count === null ? (
        <div>Not counted — only {full.daysWithData} days recorded</div>
      ) : (
        <div className="chart-tooltip-value">
          {full.count} {full.count === 1 ? 'day' : 'days'}
          <span className="chart-tooltip-head"> · {thresholdLabel.toLowerCase()}</span>
        </div>
      )}
    </div>
  );
}

export interface ThresholdChartProps {
  rows: ThresholdYear[];
  threshold: ThresholdKey;
  homogenised: boolean;
}

export function ThresholdChart({ rows, threshold, homogenised }: ThresholdChartProps) {
  const spec = THRESHOLDS.find((t) => t.key === threshold);
  const counted = rows.filter((r) => r.count !== null);

  if (spec === undefined || counted.length === 0) {
    return (
      <p className="chart-empty">
        No complete years available for this station — daily maximum and minimum series
        usually begin decades after the mean.
      </p>
    );
  }

  const data: Row[] = rows.map((r) => ({ year: r.year, count: r.count }));
  const points = counted.map((r) => ({ year: r.year, value: r.count as number }));
  const seg = trendSegment(points);
  const decades = byDecade(rows);
  const change = decadeChange(decades);

  const span = `${counted[0].year}–${counted[counted.length - 1].year}`;
  const skipped = rows.length - counted.length;

  return (
    <figure className="chart">
      <figcaption>
        {spec.label} ({spec.short}) per year · {span} · {counted.length} complete years
        {skipped > 0 && <> · {skipped} skipped for missing data</>}
        {!homogenised && <> · raw series, not homogenised</>}
      </figcaption>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            type="number"
            dataKey="year"
            domain={['dataMin', 'dataMax']}
            allowDecimals={false}
            tickCount={8}
            // See DayAcrossYearsChart: four-digit years collide on a narrow axis.
            minTickGap={28}
          />
          <YAxis type="number" allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: 'var(--axis)' }}
            content={<ThresholdTooltip rows={rows} thresholdLabel={spec.label} />}
          />
          <Bar
            dataKey="count"
            fill={spec.pole === 'warm' ? 'var(--warm)' : 'var(--cool)'}
            fillOpacity={0.85}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          {seg && (
            <ReferenceLine
              segment={[seg.from, seg.to]}
              stroke="currentColor"
              strokeWidth={2}
              strokeOpacity={0.55}
              ifOverflow="extendDomain"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="chart-trend">
        {change === null ? (
          <>Too few complete decades to state a change.</>
        ) : (
          <>
            {change.from.decade}s: {change.from.perYear.toFixed(1)} per year ·{' '}
            {change.to.decade}s: {change.to.perYear.toFixed(1)} per year ·{' '}
            <strong>
              {change.delta >= 0 ? '+' : '−'}
              {Math.abs(change.delta).toFixed(1)}
            </strong>
          </>
        )}
      </p>

      {decades.length > 0 && (
        <table className="decade-table">
          <caption>Average days per year, by decade</caption>
          <tbody>
            {decades.map((d) => (
              <tr key={d.decade}>
                <th scope="row">{d.decade}s</th>
                <td>{d.perYear.toFixed(1)}</td>
                {/* A short decade must not read like a settled figure. */}
                <td className="decade-years">
                  {d.years === 10 ? '' : `${d.years} yr${d.years === 1 ? '' : 's'}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
