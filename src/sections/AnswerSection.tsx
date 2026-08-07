import { useMemo } from 'react';
import type { Metric, PackedStation } from '../types';
import type { Headline } from '../lib/headline';
import type { DaySoFar } from '../lib/dayAggregate';
import { findHeatEpisodes, heatState } from '../lib/heatEpisodes';
import { byDecade, decadeChange, heatDaysToDate, thresholdDays } from '../lib/thresholdDays';
import { frequencyShift } from '../lib/returnPeriod';
import { buildAnswerHeadline, buildFrequencyTile, buildHeatDaysTile, buildLongTermTile } from '../lib/answer';
import { formatDayLabel, parseIso } from '../lib/dateUtil';
import { CurrentReadingCard } from '../components/CurrentReadingCard';

export interface AnswerSectionProps {
  station: PackedStation | null;
  isPlace: boolean;
  effectiveSoFar: DaySoFar | null;
  headline: Headline;
  /** The date currently selected in the day-evidence section — may be a past date. */
  viewedDateLabel: string;
  metric: Metric;
  today: string;
}

export function AnswerSection({
  station,
  isPlace,
  effectiveSoFar,
  headline,
  viewedDateLabel,
  metric,
  today,
}: AnswerSectionProps) {
  const answer = useMemo(() => {
    if (isPlace || station === null) return null;
    const { year, month, day } = parseIso(today);
    const episodes = findHeatEpisodes(station);
    const soFarMean = effectiveSoFar?.mean ?? null;
    const state = heatState(station, episodes, today, soFarMean);
    const heatDaysRows = heatDaysToDate(station, month, day, 'hotDays');
    const change = decadeChange(byDecade(thresholdDays(station, 'hotDays')));
    return {
      headline: buildAnswerHeadline(state, soFarMean),
      heatDaysTile: buildHeatDaysTile(heatDaysRows, year, formatDayLabel(today)),
      longTermTile: buildLongTermTile(change),
    };
  }, [isPlace, station, effectiveSoFar, today]);

  /**
   * How much more often a day like the one being ranked happens now.
   *
   * Keyed off the same value the rank uses, so the two can never describe
   * different days. The direction follows the deviation: above the normal the
   * question is how often it gets this warm, below it how often it gets this
   * cold — a January that shows frost disappearing is the same finding read
   * from the other end. Without a normal there is no side to take, so the tile
   * stays away rather than guessing "warm".
   */
  const frequency = useMemo(() => {
    const { comparedValue, deviation } = headline;
    if (isPlace || station === null || comparedValue === null || deviation === null) return null;
    return frequencyShift(station, metric, comparedValue, deviation >= 0 ? 'warm' : 'cool');
  }, [isPlace, station, metric, headline]);

  const frequencyTile = buildFrequencyTile(frequency);

  return (
    <section className="answer-section">
      {answer !== null && (
        <div className="heat-headline">
          <p className="heat-heading">{answer.headline.heading}</p>
          <p className="heat-sub">{answer.headline.sub}</p>
        </div>
      )}

      <CurrentReadingCard
        dateLabel={viewedDateLabel}
        metric={metric}
        headline={headline}
        soFar={effectiveSoFar}
      />

      {answer !== null ? (
        <ul className="answer-tiles">
          {/* First, because "how often" is the finding the rank cannot give. */}
          {frequencyTile !== null && <li className="answer-tile">{frequencyTile}</li>}
          <li className="answer-tile">{answer.heatDaysTile}</li>
          <li className="answer-tile">{answer.longTermTile}</li>
        </ul>
      ) : (
        <p className="status">
          Not available for a searched place — heat-wave history needs a MeteoSwiss station's
          own record, not a nearby one borrowed for the live reading.
        </p>
      )}
    </section>
  );
}
