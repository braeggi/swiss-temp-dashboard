import { useMemo } from 'react';
import type { Metric, PackedStation } from '../types';
import type { Headline } from '../lib/headline';
import type { DaySoFar } from '../lib/dayAggregate';
import { findHeatEpisodes, heatState } from '../lib/heatEpisodes';
import { byDecade, decadeChange, heatDaysToDate, thresholdDays } from '../lib/thresholdDays';
import { buildAnswerHeadline, buildHeatDaysTile, buildLongTermTile } from '../lib/answer';
import { formatDayLabel, parseIso } from '../lib/dateUtil';
import { CurrentReadingCard } from '../components/CurrentReadingCard';

export interface AnswerSectionProps {
  station: PackedStation | null;
  isPlace: boolean;
  effectiveSoFar: DaySoFar | null;
  headline: Headline;
  placeLabel: string;
  /** The date currently selected in the day-evidence section — may be a past date. */
  viewedDateLabel: string;
  metric: Metric;
  liveStationName: string | null;
  liveDistanceKm: number | null;
  today: string;
}

export function AnswerSection({
  station,
  isPlace,
  effectiveSoFar,
  headline,
  placeLabel,
  viewedDateLabel,
  metric,
  liveStationName,
  liveDistanceKm,
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

  return (
    <section className="answer-section">
      {answer !== null && (
        <div className="heat-headline">
          <p className="heat-heading">{answer.headline.heading}</p>
          <p className="heat-sub">{answer.headline.sub}</p>
        </div>
      )}

      <CurrentReadingCard
        placeLabel={placeLabel}
        dateLabel={viewedDateLabel}
        metric={metric}
        headline={headline}
        soFar={effectiveSoFar}
        liveStationName={liveStationName}
        liveDistanceKm={liveDistanceKm}
      />

      {answer !== null ? (
        <ul className="answer-tiles">
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
