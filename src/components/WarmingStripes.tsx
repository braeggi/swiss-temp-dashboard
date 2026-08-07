import { useMemo, useRef, useState } from 'react';
import { STRIPE_MAX_STEP, STRIPE_SPAN_SD, type WarmingStripes } from '../lib/warmingStripes';

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} °C`;

/** Ramp step to token. Nine steps, named the way tokens.css names them. */
const stepColour = (step: number) =>
  `var(--stripe-${step < 0 ? `n${-step}` : step})`;

/** Round year ticks that fit the span without crowding. */
function ticksFor(fromYear: number, toYear: number): number[] {
  const span = toYear - fromYear;
  const stride = span > 120 ? 40 : span > 60 ? 20 : span > 24 ? 10 : 5;
  const first = Math.ceil(fromYear / stride) * stride;
  const out: number[] = [];
  for (let y = first; y <= toYear; y += stride) out.push(y);
  return out;
}

export interface WarmingStripesChartProps {
  data: WarmingStripes;
  homogenised: boolean;
}

export function WarmingStripesChart({ data, homogenised }: WarmingStripesChartProps) {
  const [showTable, setShowTable] = useState(false);
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  const { stripes, reference } = data;
  const fromYear = stripes[0].year;
  const toYear = stripes[stripes.length - 1].year;
  const span = toYear - fromYear + 1;

  const byYear = useMemo(
    () => new Map(stripes.map((s) => [s.year, s])),
    [stripes],
  );

  // Drawn against the calendar, not against the list: a year the record could
  // not complete is dropped upstream, and packing the rest shoulder to shoulder
  // would quietly compress the axis over every gap.
  const missing = span - stripes.length;

  /** The outermost step stands for this much departure from the reference. */
  const edge = reference.sd * STRIPE_SPAN_SD;

  const hovered = hoverYear === null ? null : byYear.get(hoverYear) ?? null;

  /**
   * The change, taken from the two figures as *printed* rather than from the
   * full-precision means. 7.85 and 10.04 show as 7.9 and 10.0, whose difference
   * reads as 2.1, while the true delta rounds to 2.2 — and a reader who checks
   * the arithmetic finds it wrong on a page whose whole claim is that it can be
   * checked. The 0.05 °C given up here is worth less than that.
   */
  const shown = (n: number) => Number(n.toFixed(1));
  const delta =
    data.shift === null ? null : shown(data.shift.recent.mean) - shown(data.shift.early.mean);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = fieldRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const at = Math.floor(((e.clientX - box.left) / box.width) * span);
    setHoverYear(fromYear + Math.min(span - 1, Math.max(0, at)));
  };

  return (
    <figure className="chart">
      <figcaption>
        Annual mean · {fromYear}–{toYear} · against the {reference.fromYear}–{reference.toYear}{' '}
        average
        {missing > 0 && <> · {missing} years without a complete record</>}
      </figcaption>

      <div
        className="stripes"
        ref={fieldRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverYear(null)}
      >
        <svg
          viewBox={`0 0 ${span} 100`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Annual mean temperature for each year from ${fromYear} to ${toYear}, coloured by departure from the ${reference.fromYear}–${reference.toYear} average. The table below gives every value.`}
        >
          {stripes.map((s) => (
            <rect
              key={s.year}
              x={s.year - fromYear}
              y={0}
              width={1}
              height={100}
              fill={stepColour(s.step)}
            />
          ))}
          {hovered && (
            <rect
              className="stripes-cursor"
              x={hovered.year - fromYear}
              y={0}
              width={1}
              height={100}
            />
          )}
        </svg>

        {hovered && (
          <div
            className="chart-tooltip stripes-tooltip"
            style={{ left: `${((hovered.year - fromYear + 0.5) / span) * 100}%` }}
          >
            <div className="chart-tooltip-head">{hovered.year}</div>
            <div className="chart-tooltip-value">{hovered.value.toFixed(1)} °C</div>
            <div>{signed(hovered.anomaly)} against {reference.fromYear}–{reference.toYear}</div>
          </div>
        )}
      </div>

      <div className="stripes-axis" aria-hidden="true">
        {ticksFor(fromYear, toYear).map((y) => (
          <span key={y} style={{ left: `${((y - fromYear + 0.5) / span) * 100}%` }}>
            {y}
          </span>
        ))}
      </div>

      <div className="chart-foot">
        {/* Colour is the only encoding on the field itself, so the key has to
            say what it is worth in degrees — and the table has to exist. */}
        <div className="stripes-scale">
          <span>{signed(-edge)}</span>
          <svg width="108" height="10" aria-hidden="true">
            {Array.from({ length: STRIPE_MAX_STEP * 2 + 1 }, (_, i) => (
              <rect
                key={i}
                x={i * 12}
                y={0}
                width={12}
                height={10}
                fill={stepColour(i - STRIPE_MAX_STEP)}
              />
            ))}
          </svg>
          <span>{signed(edge)}</span>
        </div>
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
              Annual mean, and its departure from the {reference.fromYear}–{reference.toYear}{' '}
              average of {reference.mean.toFixed(1)} °C
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Annual mean</th>
                <th scope="col">Against average</th>
              </tr>
            </thead>
            <tbody>
              {[...stripes].reverse().map((s) => (
                <tr key={s.year}>
                  <th scope="row">{s.year}</th>
                  <td>{s.value.toFixed(1)} °C</td>
                  <td>{signed(s.anomaly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The field shows that something moved. The heading asks how far, and a
          colour cannot answer that — so the figure is stated. */}
      <p className="chart-trend">
        {data.shift === null || delta === null ? (
          <>Each stripe is one year, coloured against the {reference.fromYear}–
            {reference.toYear} average</>
        ) : (
          <>
            {data.shift.early.fromYear}–{data.shift.early.toYear} averaged{' '}
            {data.shift.early.mean.toFixed(1)} °C · {data.shift.recent.fromYear}–
            {data.shift.recent.toYear} averaged {data.shift.recent.mean.toFixed(1)} °C ·{' '}
            <strong className={delta >= 0 ? 'dev-warm' : 'dev-cool'}>{signed(delta)}</strong>
          </>
        )}
        {!homogenised && <> · raw series, not homogenised</>}
      </p>
    </figure>
  );
}
