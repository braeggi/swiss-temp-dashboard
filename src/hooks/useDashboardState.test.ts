// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { StationIndexEntry } from '../types';

const STATIONS: StationIndexEntry[] = [
  { abbr: 'SMA', name: 'Zürich / Fluntern', canton: 'ZH', lat: 47.38, lon: 8.57, altitude: 556, source: 'smn', homogenised: true, fromYear: 1901, toYear: 2026 },
  { abbr: 'BUS', name: 'Buchs / Aarau', canton: 'AG', lat: 47.39, lon: 8.08, altitude: 387, source: 'smn', homogenised: false, fromYear: 1984, toYear: 2026 },
];

vi.mock('../lib/sources/stationIndex', () => ({
  loadStationIndex: vi.fn(() => Promise.resolve(STATIONS)),
}));
vi.mock('./useStationSeries', () => ({
  useStationSeries: vi.fn(() => ({
    station: null, soFar: null, liveStale: false, loading: false, error: null,
  })),
}));
vi.mock('../lib/sources/openMeteo', () => ({
  geocode: vi.fn(() => Promise.resolve([])),
  openMeteoDaily: vi.fn(() => Promise.resolve({ mean: [], max: [], min: [] })),
}));

import { useDashboardState } from './useDashboardState';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useDashboardState', () => {
  it('hydrates the selected station from the URL once the index loads', async () => {
    window.history.replaceState(null, '', '/?station=BUS');
    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.selected?.abbr).toBe('BUS'));
  });

  it('falls back to the default station when the URL names none', async () => {
    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.selected?.abbr).toBe('SMA'));
  });

  it('ignores a date change that is not a valid ISO calendar date', async () => {
    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    const before = result.current.date;
    act(() => result.current.setDate('not-a-date'));
    expect(result.current.date).toBe(before);
    act(() => result.current.setDate('2026-02-30')); // shape ok, calendar impossible
    expect(result.current.date).toBe(before);
  });

  it('accepts a valid ISO date', async () => {
    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    act(() => result.current.setDate('2020-07-15'));
    expect(result.current.date).toBe('2020-07-15');
  });

  it('selecting a station clears any previously selected place', async () => {
    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    act(() => result.current.setPlace({ name: 'Susch', lat: 46.7, lon: 10.0, altitude: 1400 }));
    expect(result.current.place).not.toBeNull();
    act(() => result.current.selectStation(STATIONS[1]));
    expect(result.current.place).toBeNull();
    expect(result.current.selected?.abbr).toBe('BUS');
  });

  it('captures the legacy view param once, from the URL at mount', async () => {
    window.history.replaceState(null, '', '/?view=year');
    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.legacyView).toBe('year');
  });

  it('has no legacy view when the URL carries none', async () => {
    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.legacyView).toBeUndefined();
  });
});
