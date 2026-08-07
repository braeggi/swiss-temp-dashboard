// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DayEvidence from './DayEvidence';

// jsdom has no ResizeObserver, and Recharts' ResponsiveContainer constructs one
// on mount. The stub reports no size, so Recharts skips drawing the SVG itself —
// which is fine here: these tests assert on the controls, not the chart geometry.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

describe('DayEvidence', () => {
  it('renders its own date, metric, and window controls', () => {
    render(
      <DayEvidence
        date="2026-07-31" today="2026-07-31" onDateChange={vi.fn()}
        metric="mean" onMetricChange={vi.fn()}
        windowDays={0} onWindowChange={vi.fn()} windowDisabled={false}
        points={[{ year: 2020, value: 20 }]} dateLabel="31 July"
        todayValue={null} todayYear={2026} homogenised={true} norm={null}
      />,
    );
    expect(screen.getByLabelText('Day')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Averaging' })).toBeInTheDocument();
  });

  it('disables the averaging window for a geocoded place', () => {
    render(
      <DayEvidence
        date="2026-07-31" today="2026-07-31" onDateChange={vi.fn()}
        metric="mean" onMetricChange={vi.fn()}
        windowDays={0} onWindowChange={vi.fn()} windowDisabled
        points={[]} dateLabel="31 July"
        todayValue={null} todayYear={2026} homogenised={false} norm={null}
      />,
    );
    for (const button of screen.getAllByRole('button', { name: /day|days/i })) {
      expect(button).toBeDisabled();
    }
  });
});
