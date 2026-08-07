// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChartTooltip, DayAcrossYearsChart } from './DayAcrossYearsChart';
import { DateControl } from './DateControl';
import { StationBar } from './StationBar';
import { WarmingStripesChart } from './WarmingStripes';
import { CurrentReadingCard } from './CurrentReadingCard';
import { SourceNote } from './SourceNote';
import { YearOverviewChart } from './YearOverviewChart';
import type { YearDay } from '../lib/yearOverview';
import type { Headline } from '../lib/headline';
import type { DaySoFar } from '../lib/dayAggregate';
import type { SourcePlan, StationIndexEntry } from '../types';

afterEach(cleanup);

// jsdom has no ResizeObserver, and Recharts' ResponsiveContainer constructs one
// on mount. The stub reports no size, so Recharts skips drawing the SVG itself —
// which is fine here: these tests assert on the caption, tally and legend, the
// plain DOM a reader depends on to interpret the picture. The chart geometry is
// verified in the browser instead.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const station: StationIndexEntry = {
  abbr: 'BUS',
  name: 'Buchs / Aarau',
  canton: 'AG',
  lat: 47.384381,
  lon: 8.07955,
  altitude: 387,
  source: 'smn',
  homogenised: false,
  fromYear: 1984,
  toYear: 2025,
};

const soFar: DaySoFar = {
  mean: 21,
  max: 30,
  min: 12,
  latest: { year: 2026, month: 7, day: 31, hour: 6, minute: 40, celsius: 26.3 },
  count: 40,
};

const headline = (over: Partial<Headline> = {}): Headline => ({
  rank: 8,
  total: 42,
  deviation: 1.4,
  hottest: { year: 2018, value: 34.1 },
  coldest: { year: 1987, value: 17.3 },
  provisional: true,
  comparedValue: 27.1,
  ...over,
});

describe('ChartTooltip', () => {
  // Regression guard: a ScatterChart tooltip payload carries BOTH axis dataKeys,
  // and the original code ran a single °C formatter over every entry — so the
  // year rendered as a temperature ("2026.0 °C") on a second row.
  const payload = [{ payload: { year: 1953, value: 15.9 } }];

  it('renders the year in the heading, never as a temperature', () => {
    render(
      <ChartTooltip
        active
        payload={payload}
        dateLabel="31 July"
        metric="mean"
        todayYear={2026}
        isTodayShown
      />,
    );
    expect(screen.getByText(/31 July 1953/)).toBeInTheDocument();
    // The bug printed the year with a degree sign. It must never do that again.
    expect(screen.queryByText(/1953.*°C/)).not.toBeInTheDocument();
  });

  it('shows exactly one temperature, the point value', () => {
    const { container } = render(
      <ChartTooltip
        active
        payload={payload}
        dateLabel="31 July"
        metric="mean"
        todayYear={2026}
        isTodayShown
      />,
    );
    const degrees = container.textContent?.match(/°C/g) ?? [];
    expect(degrees).toHaveLength(1);
    expect(container).toHaveTextContent('Daily mean 15.9 °C');
  });

  it('marks the provisional point as today, and only that point', () => {
    render(
      <ChartTooltip
        active
        payload={[{ payload: { year: 2026, value: 21.7 } }]}
        dateLabel="31 July"
        metric="mean"
        todayYear={2026}
        isTodayShown
      />,
    );
    expect(screen.getByText(/today, so far/)).toBeInTheDocument();
    cleanup();

    render(
      <ChartTooltip
        active
        payload={payload}
        dateLabel="31 July"
        metric="mean"
        todayYear={2026}
        isTodayShown
      />,
    );
    expect(screen.queryByText(/today, so far/)).not.toBeInTheDocument();
  });

  it('does not claim "today" when no today point is plotted', () => {
    render(
      <ChartTooltip
        active
        payload={[{ payload: { year: 2026, value: 21.7 } }]}
        dateLabel="31 July"
        metric="mean"
        todayYear={2026}
        isTodayShown={false}
      />,
    );
    expect(screen.queryByText(/today, so far/)).not.toBeInTheDocument();
  });

  it('renders nothing when inactive or payload-less', () => {
    const { container: a } = render(
      <ChartTooltip
        active={false}
        payload={payload}
        dateLabel="31 July"
        metric="mean"
        todayYear={2026}
        isTodayShown
      />,
    );
    expect(a).toBeEmptyDOMElement();
    cleanup();

    const { container: b } = render(
      <ChartTooltip
        active
        payload={[]}
        dateLabel="31 July"
        metric="mean"
        todayYear={2026}
        isTodayShown
      />,
    );
    expect(b).toBeEmptyDOMElement();
  });
});

describe('StationBar', () => {
  const bar = (over: Partial<React.ComponentProps<typeof StationBar>> = {}) => (
    <StationBar
      placeLabel="Aarau"
      historyStation={station}
      liveStationName="Buchs / Aarau"
      liveDistanceKm={2.8}
      soFar={soFar}
      index={[station]}
      selected={station}
      onSelect={() => {}}
      onSelectPlace={() => {}}
      searchPlaces={async () => []}
      {...over}
    />
  );

  it('carries the place, its reading right now, and how deep its record runs', () => {
    const { container } = render(bar());
    // 26.3 is the latest instantaneous reading; the day's running max is 30,
    // and that one belongs to the answer column, not up here.
    expect(container).toHaveTextContent('Aarau');
    expect(container).toHaveTextContent('now 26.3 °C');
    expect(container).toHaveTextContent('387 m');
    expect(container).toHaveTextContent('since 1984');
    expect(container).not.toHaveTextContent(/Day so far/);
  });

  it('discloses that the reading comes from a station 2.8 km away', () => {
    const { container } = render(bar());
    expect(container).toHaveTextContent('Buchs / Aarau');
    expect(container).toHaveTextContent('2.8 km');
  });

  // Most stations report their own live values, and repeating the name would
  // read as two places rather than one.
  it('does not name the live station when it is the place itself', () => {
    const { container } = render(bar({ placeLabel: 'Buchs / Aarau' }));
    expect(container.textContent!.match(/Buchs \/ Aarau/g)).toHaveLength(1);
    expect(container).not.toHaveTextContent('2.8 km');
  });
});

describe('CurrentReadingCard', () => {
  const base = {
    dateLabel: '31 July',
    metric: 'mean' as const,
  };

  it('reports the day as far as it has got', () => {
    const { container } = render(
      <CurrentReadingCard {...base} headline={headline()} soFar={soFar} />,
    );
    expect(container).toHaveTextContent(/Day so far/);
    expect(container).toHaveTextContent(/still in progress/);
  });

  it('degrades to "no comparable reading" instead of rendering a null rank', () => {
    // Reached when the live feed is down, or too early in the day to rank.
    const { container } = render(
      <CurrentReadingCard
        {...base}
        headline={headline({ rank: null, comparedValue: null, deviation: null })}
        soFar={null}
      />,
    );
    expect(container).toHaveTextContent(/No comparable reading for 31 July yet/);
    expect(container.textContent).not.toMatch(/null|NaN|undefined/);
  });

  it('omits the records line when the series has no extremes', () => {
    const { container } = render(
      <CurrentReadingCard
        {...base}
        headline={headline({ hottest: null, coldest: null })}
        soFar={soFar}
      />,
    );
    expect(container.textContent).not.toMatch(/Record/);
  });

  it('drops the "in progress" marker for a finished past day', () => {
    const { container } = render(
      <CurrentReadingCard
        {...base}
        headline={headline({ provisional: false })}
        soFar={null}
      />,
    );
    expect(container.textContent).not.toMatch(/still in progress/);
  });
});

describe('SourceNote', () => {
  const plan: SourcePlan = {
    label: 'Aarau',
    historyStation: station,
    liveStation: station,
    liveDistanceKm: 2.8,
    caveats: [
      'Measured at Buchs / Aarau, 2.8 km away, 387 m.',
      'Raw measured series, not homogenised — station moves are not corrected for.',
    ],
  };

  it('always credits MeteoSwiss', () => {
    const { container } = render(<SourceNote plan={plan} usesOpenMeteo={false} />);
    expect(container).toHaveTextContent('Source: MeteoSwiss');
  });

  it('credits Open-Meteo only when it is actually used', () => {
    const { container: off } = render(<SourceNote plan={plan} usesOpenMeteo={false} />);
    expect(off.textContent).not.toMatch(/Open-Meteo/);
    cleanup();

    const { container: on } = render(<SourceNote plan={plan} usesOpenMeteo />);
    expect(on).toHaveTextContent(/Open-Meteo/);
    expect(on).toHaveTextContent('Source: MeteoSwiss');
  });

  it('renders every caveat verbatim, including the homogenisation warning', () => {
    const { container } = render(<SourceNote plan={plan} usesOpenMeteo={false} />);
    for (const c of plan.caveats) expect(container).toHaveTextContent(c);
  });
});

describe('YearOverviewChart legend', () => {
  // Recharts itself cannot render under jsdom (ResponsiveContainer needs a real
  // layout), so assert on the parts that are plain DOM: the caption, the tally
  // and the key. Those are what a reader relies on to interpret the picture.
  // Mirror the real slot -> calendar mapping so assertions about dates mean
  // something; a flat month: 1 produced nonsense like "200 Jan".
  const MONTH_OFFSET = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const calendar = (slot: number) => {
    let m = 12;
    for (let i = 0; i < 12; i++) {
      if (slot < MONTH_OFFSET[i]) { m = i; break; }
    }
    return { month: m, day: slot - MONTH_OFFSET[m - 1] + 1 };
  };
  const day = (slot: number, over: Partial<YearDay> = {}): YearDay => ({
    slot,
    ...calendar(slot),
    recordMin: 0,
    recordMax: 20,
    p10: 5,
    p90: 15,
    normal: 10,
    current: 12,
    years: 100,
    ...over,
  });
  const days = Array.from({ length: 366 }, (_, i) => day(i));

  it('names all four marks a reader has to decode', () => {
    const { container } = render(
      <YearOverviewChart days={days} metric="mean" year={2026} homogenised />,
    );
    expect(container).toHaveTextContent('Full recorded range');
    expect(container).toHaveTextContent('Usual range');
    expect(container).toHaveTextContent('Average');
    expect(container).toHaveTextContent('2026');
  });

  it('explains what the usual range actually means', () => {
    const { container } = render(
      <YearOverviewChart days={days} metric="mean" year={2026} homogenised />,
    );
    expect(container).toHaveTextContent(/middle 80 %/);
  });

  it('draws the usual-range swatch with both fills, as the chart stacks them', () => {
    // A single-layer swatch would be lighter than the band actually drawn.
    const { container } = render(
      <YearOverviewChart days={days} metric="mean" year={2026} homogenised />,
    );
    const swatches = container.querySelectorAll('.chart-key svg');
    expect(swatches).toHaveLength(4);
    expect(swatches[0].querySelectorAll('rect')).toHaveLength(1); // record only
    expect(swatches[1].querySelectorAll('rect')).toHaveLength(2); // record + usual
  });

  it('reports the day count in the legend and the tally consistently', () => {
    const partial = days.map((d, i) => (i < 200 ? d : { ...d, current: null }));
    const { container } = render(
      <YearOverviewChart days={partial} metric="mean" year={2026} homogenised />,
    );
    expect(container).toHaveTextContent('200 days recorded ·');
    // Slot 199 is 18 July, not 19: February always occupies 29 slots in the
    // leap-safe layout, so slot numbers run one behind a common year's
    // day-of-year from March onwards. The legend must name the day actually held.
    expect(container).toHaveTextContent('latest 18 Jul');
  });

  it('flags a raw series in the caption', () => {
    const { container } = render(
      <YearOverviewChart days={days} metric="mean" year={2026} homogenised={false} />,
    );
    expect(container).toHaveTextContent(/raw series, not homogenised/);
  });

  it('degrades to a message when the station has no yearly record', () => {
    const empty = days.map((d) => ({ ...d, years: 0, recordMin: null, recordMax: null }));
    const { container } = render(
      <YearOverviewChart days={empty} metric="mean" year={2026} homogenised />,
    );
    expect(container).toHaveTextContent(/No yearly record available/);
  });
});

describe('DateControl steppers', () => {
  it('steps a day back, and forward when there is room', () => {
    const seen: string[] = [];
    render(<DateControl value="2026-08-05" today="2026-08-07" onChange={(d) => seen.push(d)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));

    expect(seen).toEqual(['2026-08-04', '2026-08-06']);
  });

  it('refuses to step past today', () => {
    const seen: string[] = [];
    render(<DateControl value="2026-08-07" today="2026-08-07" onChange={(d) => seen.push(d)} />);

    const next = screen.getByRole('button', { name: 'Next day' });
    expect(next).toBeDisabled();

    fireEvent.click(next);
    expect(seen).toEqual([]);
  });
});

describe('DayAcrossYearsChart marker labelling', () => {
  const history = [
    { year: 2023, value: 19 },
    { year: 2024, value: 20 },
    { year: 2025, value: 21 },
  ];

  it('calls the marker "today, so far" only while today is the day in view', () => {
    render(
      <DayAcrossYearsChart
        points={history} metric="mean" dateLabel="7 August"
        todayValue={22.4} todayYear={2026} homogenised provisional
      />,
    );
    expect(screen.getByText('Today, so far')).toBeInTheDocument();
  });

  // The marker on a past date highlights that date's own year — a completed
  // value, not a reading in progress. Claiming "today, so far" for 3 August
  // while today is the 7th states something untrue about the data.
  it('names the marked year instead when a past day is in view', () => {
    render(
      <DayAcrossYearsChart
        points={history} metric="mean" dateLabel="3 August"
        todayValue={21} todayYear={2025} homogenised provisional={false}
      />,
    );
    expect(screen.queryByText('Today, so far')).not.toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
  });
});

describe('WarmingStripesChart', () => {
  // Reproduces what the live page printed: "7.9 °C · 10.0 °C · +2.2 °C". The
  // endpoints round to a 2.1 gap while the full-precision delta rounds to 2.2,
  // so a reader who checks the subtraction finds it wrong — on a page whose
  // whole claim is that it can be checked.
  const data = {
    stripes: [
      { year: 1900, value: 7.86, anomaly: -2.18, step: -4 },
      { year: 2025, value: 10.04, anomaly: 0, step: 4 },
    ],
    reference: { fromYear: 1961, toYear: 1990, years: 30, mean: 10.04, sd: 0.6 },
    shift: {
      early: { fromYear: 1864, toYear: 1893, mean: 7.86 },
      recent: { fromYear: 1996, toYear: 2025, mean: 10.04 },
      delta: 2.18,
    },
  };

  it('states a change that agrees with the two figures beside it', () => {
    const { container } = render(<WarmingStripesChart data={data} homogenised />);
    const trend = container.querySelector('.chart-trend')!.textContent!;

    const [early, recent, delta] = [...trend.matchAll(/([+−]?)(\d+\.\d)\s*°C/g)]
      .map(([, sign, n]) => (sign === '−' ? -Number(n) : Number(n)));

    expect(Number((recent - early).toFixed(1))).toBe(delta);
    expect(trend).toContain('+2.1 °C');
  });

  it('falls back to describing the stripes when there is no figure to give', () => {
    const { container } = render(
      <WarmingStripesChart data={{ ...data, shift: null }} homogenised />,
    );
    expect(container).toHaveTextContent(/coloured against the 1961–1990 average/);
  });
});
