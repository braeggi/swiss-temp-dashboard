// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AnswerSection } from './AnswerSection';
import { allocateSeries, encodeValue, indexFor } from '../lib/packed';
import type { PackedStation } from '../types';
import type { Headline } from '../lib/headline';

afterEach(cleanup);

const emptyHeadline: Headline = {
  rank: null, total: 0, deviation: null, hottest: null, coldest: null,
  provisional: false, comparedValue: null,
};

/** A station with a 3-day heat wave ending 30 July 2026, no data on 31 July. */
function stationWithRunningWave(): PackedStation {
  const fromYear = 2020;
  const toYear = 2026;
  const mean = allocateSeries(fromYear, toYear);
  const max = allocateSeries(fromYear, toYear);
  const min = allocateSeries(fromYear, toYear);
  for (const [day, v] of [[28, 26], [29, 27], [30, 26]] as const) {
    mean[indexFor(fromYear, 2026, 7, day)] = encodeValue(v);
    max[indexFor(fromYear, 2026, 7, day)] = encodeValue(v + 3);
  }
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: true, fromYear, toYear, mean, max, min,
  };
}

describe('AnswerSection', () => {
  it('shows the heat-state headline and the reading card for a real station', () => {
    render(
      <AnswerSection
        station={stationWithRunningWave()}
        isPlace={false}
        effectiveSoFar={{
          mean: 27, max: 30, min: 24, count: 12,
          latest: { year: 2026, month: 7, day: 31, hour: 10, minute: 0, celsius: 27 },
        }}
        headline={emptyHeadline}
        viewedDateLabel="31 July"
        metric="mean"
        today="2026-07-31"
      />,
    );
    expect(screen.getByText('Day 4 of a heat wave')).toBeInTheDocument();
    // The day's own figures. Which station this is now belongs to the masthead,
    // so the column no longer repeats it — see StationBar.
    expect(screen.getByText(/Day so far/)).toBeInTheDocument();
  });

  it('shows an explanatory message instead of tiles when there is no station', () => {
    render(
      <AnswerSection
        station={null}
        isPlace={false}
        effectiveSoFar={null}
        headline={emptyHeadline}
        viewedDateLabel="31 July"
        metric="mean"
        today="2026-07-31"
      />,
    );
    expect(screen.getByText(/Not available for a searched place/)).toBeInTheDocument();
  });

  it('does not attribute a borrowed station\'s heat history to a searched place', () => {
    render(
      <AnswerSection
        station={stationWithRunningWave()}
        isPlace={true}
        effectiveSoFar={null}
        headline={emptyHeadline}
        viewedDateLabel="31 July"
        metric="mean"
        today="2026-07-31"
      />,
    );
    expect(screen.queryByText(/Day \d+ of a heat wave/)).not.toBeInTheDocument();
    expect(screen.getByText(/Not available for a searched place/)).toBeInTheDocument();
  });
});
