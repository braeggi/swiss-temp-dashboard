// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import YearEvidence from './YearEvidence';
import { allocateSeries, encodeValue, indexFor } from '../lib/packed';
import type { PackedStation } from '../types';

// jsdom has no ResizeObserver, and Recharts' ResponsiveContainer constructs one
// on mount. The stub reports no size, so Recharts skips drawing the SVG itself —
// which is fine here: these tests assert on the controls, not the chart geometry.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

function station(): PackedStation {
  const fromYear = 2020;
  const toYear = 2026;
  const mean = allocateSeries(fromYear, toYear);
  mean[indexFor(fromYear, 2026, 7, 31)] = encodeValue(24);
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: true, fromYear, toYear,
    mean, max: allocateSeries(fromYear, toYear), min: allocateSeries(fromYear, toYear),
  };
}

describe('YearEvidence', () => {
  it('renders the year chart with its own metric toggle for a real station', () => {
    render(<YearEvidence station={station()} isPlace={false} year={2026} homogenised={true} />);
    expect(screen.getByRole('group', { name: 'Temperature metric' })).toBeInTheDocument();
  });

  it('explains unavailability for a geocoded place instead of showing controls', () => {
    render(<YearEvidence station={null} isPlace year={2026} homogenised={false} />);
    expect(screen.getByText(/Not available for a searched place/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Temperature metric' })).not.toBeInTheDocument();
  });
});
