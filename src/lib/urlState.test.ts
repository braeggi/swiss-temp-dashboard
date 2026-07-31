import { describe, expect, it } from 'vitest';
import { buildUrlSearch, parseUrlState } from './urlState';

describe('parseUrlState', () => {
  it('reads a full station link', () => {
    expect(parseUrlState('?station=BUS&date=2026-07-30&metric=max')).toEqual({
      station: 'BUS',
      date: '2026-07-30',
      metric: 'max',
    });
  });

  it('uppercases the station abbreviation', () => {
    expect(parseUrlState('?station=bus').station).toBe('BUS');
  });

  it('returns an empty state for no query', () => {
    expect(parseUrlState('')).toEqual({});
  });

  // A shared link can be truncated or hand-edited. Each field is validated on
  // its own so a partly-broken link still restores the parts that survived.
  it('drops an invalid field but keeps the valid ones', () => {
    expect(parseUrlState('?station=BUS&date=not-a-date&metric=max')).toEqual({
      station: 'BUS',
      metric: 'max',
    });
  });

  it('rejects a date that is impossible rather than merely misshapen', () => {
    // The whole reason isIsoDate now validates the calendar: this used to pass
    // and then throw in the render path.
    expect(parseUrlState('?date=0000-00-00').date).toBeUndefined();
    expect(parseUrlState('?date=2026-02-29').date).toBeUndefined();
    expect(parseUrlState('?date=2024-02-29').date).toBe('2024-02-29');
  });

  it('rejects an unknown metric', () => {
    expect(parseUrlState('?metric=median').metric).toBeUndefined();
    expect(parseUrlState('?metric=min').metric).toBe('min');
  });

  it('rejects a station abbreviation of the wrong shape', () => {
    for (const s of ['B', 'BUSX', '12', '', 'B-S']) {
      expect(parseUrlState(`?station=${s}`).station).toBeUndefined();
    }
  });

  it('reads a geocoded place only when name and both coordinates are present', () => {
    expect(parseUrlState('?place=Susch&lat=46.7481&lon=10.0808').place).toEqual({
      name: 'Susch',
      lat: 46.7481,
      lon: 10.0808,
    });
    expect(parseUrlState('?place=Susch&lat=46.7481').place).toBeUndefined();
    expect(parseUrlState('?lat=46.7481&lon=10.0808').place).toBeUndefined();
  });

  it('rejects out-of-range or non-numeric coordinates', () => {
    expect(parseUrlState('?place=X&lat=91&lon=0').place).toBeUndefined();
    expect(parseUrlState('?place=X&lat=0&lon=181').place).toBeUndefined();
    expect(parseUrlState('?place=X&lat=abc&lon=0').place).toBeUndefined();
  });
});

describe('buildUrlSearch', () => {
  const today = '2026-07-31';

  it('omits everything at its default', () => {
    expect(
      buildUrlSearch({ stationAbbr: 'SMA', place: null, date: today, today, metric: 'mean', windowDays: 0, view: 'day', threshold: 'hotDays' }),
    ).toBe('?station=SMA');
  });

  it('is empty when nothing is selected', () => {
    expect(
      buildUrlSearch({ stationAbbr: null, place: null, date: today, today, metric: 'mean', windowDays: 0, view: 'day', threshold: 'hotDays' }),
    ).toBe('');
  });

  it('includes a non-default date and metric', () => {
    expect(
      buildUrlSearch({
        stationAbbr: 'BUS',
        place: null,
        date: '2026-07-30',
        today,
        metric: 'max',
        windowDays: 0,
      view: 'day' as const,
      threshold: 'hotDays' as const,
      }),
    ).toBe('?station=BUS&date=2026-07-30&metric=max');
  });

  it('never emits both station and place', () => {
    const s = buildUrlSearch({
      stationAbbr: 'BUS',
      place: { name: 'Susch', lat: 46.7481, lon: 10.0808 },
      date: today,
      today,
      metric: 'mean',
      windowDays: 0,
      view: 'day' as const,
      threshold: 'hotDays' as const,
    });
    expect(s).toContain('place=Susch');
    expect(s).not.toContain('station=');
  });

  it('rounds coordinates to five decimals', () => {
    const s = buildUrlSearch({
      stationAbbr: null,
      place: { name: 'X', lat: 46.74812345678, lon: 10.08087654321 },
      date: today,
      today,
      metric: 'mean',
      windowDays: 0,
      view: 'day' as const,
      threshold: 'hotDays' as const,
    });
    expect(s).toContain('lat=46.74812');
    expect(s).toContain('lon=10.08088');
  });

  it('round-trips through parseUrlState', () => {
    const state = {
      stationAbbr: 'BUS' as const,
      place: null,
      date: '2026-01-15',
      today,
      metric: 'min' as const,
      windowDays: 0 as const,
      view: 'day' as const,
      threshold: 'hotDays' as const,
    };
    expect(parseUrlState(buildUrlSearch(state))).toEqual({
      station: 'BUS',
      date: '2026-01-15',
      metric: 'min',
    });
  });

  it('round-trips a geocoded place', () => {
    const place = { name: 'Susch', lat: 46.7481, lon: 10.0808 };
    const parsed = parseUrlState(
      buildUrlSearch({ stationAbbr: null, place, date: today, today, metric: 'mean', windowDays: 0, view: 'day', threshold: 'hotDays' }),
    );
    expect(parsed.place).toEqual(place);
  });
});

describe('window parameter', () => {
  const today = '2026-07-31';

  it('reads only the offered widths', () => {
    expect(parseUrlState('?window=3').windowDays).toBe(3);
    expect(parseUrlState('?window=7').windowDays).toBe(7);
    expect(parseUrlState('?window=0').windowDays).toBe(0);
  });

  it('rejects a width the UI does not offer', () => {
    for (const w of ['5', '-3', '999', 'abc', '3.5']) {
      expect(parseUrlState(`?window=${w}`).windowDays).toBeUndefined();
    }
  });

  it('omits the default single-day window from the link', () => {
    expect(
      buildUrlSearch({ stationAbbr: 'SMA', place: null, date: today, today, metric: 'mean', windowDays: 0, view: 'day', threshold: 'hotDays' }),
    ).toBe('?station=SMA');
  });

  it('round-trips a non-default window', () => {
    const s = buildUrlSearch({
      stationAbbr: 'SMA', place: null, date: today, today, metric: 'mean', windowDays: 7, view: 'day' as const,
      threshold: 'hotDays' as const,
    });
    expect(s).toBe('?station=SMA&window=7');
    expect(parseUrlState(s).windowDays).toBe(7);
  });
});

describe('view parameter', () => {
  const today = '2026-07-31';
  const base = { stationAbbr: 'SMA', place: null, date: today, today, metric: 'mean' as const, windowDays: 0 as const };

  it('omits the default day view', () => {
    expect(buildUrlSearch({ ...base, view: 'day', threshold: 'hotDays' })).toBe('?station=SMA');
  });

  it('round-trips the year view', () => {
    const s = buildUrlSearch({ ...base, view: 'year', threshold: 'hotDays' });
    expect(s).toBe('?station=SMA&view=year');
    expect(parseUrlState(s).view).toBe('year');
  });

  it('rejects an unknown view', () => {
    expect(parseUrlState('?view=decade').view).toBeUndefined();
  });
});

describe('threshold parameter', () => {
  const today = '2026-07-31';
  const base = {
    stationAbbr: 'SMA', place: null, date: today, today,
    metric: 'mean' as const, windowDays: 0 as const, view: 'threshold' as const,
  };

  it('omits the default threshold', () => {
    expect(buildUrlSearch({ ...base, threshold: 'hotDays' })).toBe('?station=SMA&view=threshold');
  });

  it('round-trips a non-default threshold', () => {
    const s = buildUrlSearch({ ...base, threshold: 'frostDays' });
    expect(s).toContain('threshold=frostDays');
    expect(parseUrlState(s).threshold).toBe('frostDays');
  });

  it('rejects an unknown threshold', () => {
    expect(parseUrlState('?threshold=mildDays').threshold).toBeUndefined();
  });
});
