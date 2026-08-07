// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendEvidence from './TrendEvidence';
import { allocateSeries, encodeValue, indexFor } from '../lib/packed';
import type { PackedStation } from '../types';

function station(): PackedStation {
  const fromYear = 1990;
  const toYear = 2026;
  const max = allocateSeries(fromYear, toYear);
  for (let y = fromYear; y <= toYear; y++) {
    max[indexFor(fromYear, y, 7, 15)] = encodeValue(31);
  }
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: true, fromYear, toYear,
    mean: allocateSeries(fromYear, toYear), max, min: allocateSeries(fromYear, toYear),
  };
}

describe('TrendEvidence', () => {
  it('renders the threshold chart and toggle for a real station', () => {
    render(
      <TrendEvidence
        station={station()} isPlace={false}
        threshold="hotDays" onThresholdChange={vi.fn()} homogenised={true}
      />,
    );
    expect(screen.getByRole('group', { name: 'Count' })).toBeInTheDocument();
  });

  it('explains unavailability for a geocoded place instead of showing controls', () => {
    render(
      <TrendEvidence
        station={null} isPlace
        threshold="hotDays" onThresholdChange={vi.fn()} homogenised={false}
      />,
    );
    expect(screen.getByText(/Not available for a searched place/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Count' })).not.toBeInTheDocument();
  });
});
