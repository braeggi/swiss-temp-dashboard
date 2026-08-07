import type { Metric } from '../types';
import type { DaySoFar } from '../lib/dayAggregate';
import { ordinal, type Headline } from '../lib/headline';

const METRIC_WORD: Record<Metric, string> = {
  mean: 'mean',
  max: 'max',
  min: 'min',
};

// Non-breaking space before the unit: in the narrow answer column "min 17.7 °C"
// otherwise breaks after the figure and leaves the unit stranded on its own line.
const fmt = (n: number) => `${n.toFixed(1)} °C`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} °C`;

export interface CurrentReadingCardProps {
  dateLabel: string;
  metric: Metric;
  headline: Headline;
  soFar: DaySoFar | null;
  /** False where a single-day ranking is not the question being asked. */
  showVerdict?: boolean;
}

/**
 * What the viewed day amounts to: how it ranks, how far it sits from normal,
 * and the records it is measured against.
 *
 * Which station this is, and what it reads at this minute, belong to the
 * masthead — they frame every section of the page, not just this one.
 */
export function CurrentReadingCard({
  dateLabel,
  metric,
  headline,
  soFar,
  showVerdict = true,
}: CurrentReadingCardProps) {
  return (
    <section className="reading-card">
      {soFar && (
        <p className="reading-sofar">
          Day so far: max {fmt(soFar.max)}, mean {fmt(soFar.mean)}, min {fmt(soFar.min)}
          {headline.provisional && <em> · still in progress</em>}
        </p>
      )}

      {showVerdict && (
      <>
      {/* The rank is the answer to the question the page asks, so it gets the
          size. The rest of the card is the working. Proportional figures, not
          tabular — equal-width digits look loose at display size. */}
      {headline.rank !== null && headline.total > 0 ? (
        <p className="reading-verdict">
          <strong className="reading-rank-figure">{ordinal(headline.rank)}</strong>
          <span className="reading-rank-of">
            warmest {dateLabel} {METRIC_WORD[metric]}
            <br />
            of {headline.total} years on record
          </span>
        </p>
      ) : (
        <p className="reading-verdict reading-verdict-quiet">
          No comparable reading for {dateLabel} yet
        </p>
      )}

      {headline.deviation !== null && (
        <p className="reading-deviation">
          <span className={headline.deviation >= 0 ? 'dev-warm' : 'dev-cool'}>
            {signed(headline.deviation)}
          </span>{' '}
          against the 1991–2020 normal
        </p>
      )}

      {headline.hottest && headline.coldest && (
        <p className="reading-records">
          Record {fmt(headline.hottest.value)} ({headline.hottest.year}) · Lowest{' '}
          {fmt(headline.coldest.value)} ({headline.coldest.year})
        </p>
      )}
      </>
      )}
    </section>
  );
}
