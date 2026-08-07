import type { HeatState } from './heatEpisodes';
import type { DecadeSummary, YearToDate } from './thresholdDays';
import { formatDayLabel } from './dateUtil';

const fmt = (n: number) => `${n.toFixed(1)} °C`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface AnswerHeadline {
  heading: string;
  sub: string;
}

/**
 * The page's single most important sentence: which of the three things
 * `heatState` found, turned into the words a reader sees first.
 */
export function buildAnswerHeadline(state: HeatState, soFarMean: number | null): AnswerHeadline {
  if (state.kind === 'running') {
    const { episode, dayNumber } = state;
    const base = `${plural(episode.days, 'day')} completed since ${formatDayLabel(episode.startDate)}`;
    return {
      heading: `Day ${dayNumber} of a heat wave`,
      sub: soFarMean !== null ? `${base} · today so far ${fmt(soFarMean)}, still in progress` : base,
    };
  }

  if (state.kind === 'thisYear') {
    if (state.lastEpisode !== null) {
      const e = state.lastEpisode;
      return {
        heading: `Summer ${state.year} · ${plural(state.qualifyingDays, 'heat day')} so far`,
        sub: `Last heat wave ${formatDayLabel(e.startDate)}–${formatDayLabel(e.endDate)}, ${e.days} days`,
      };
    }
    return {
      heading: `Summer ${state.year} · ${plural(state.qualifyingDays, 'warm day')} so far`,
      sub: 'None of them have yet formed a three-day heat wave.',
    };
  }

  if (state.longestEpisode !== null && state.year !== null) {
    const e = state.longestEpisode;
    return {
      heading: `Summer ${state.year} in review`,
      sub: `Longest heat wave: ${e.days} days, ${formatDayLabel(e.startDate)}–${formatDayLabel(e.endDate)}`,
    };
  }
  return {
    heading: 'No recorded heat wave yet',
    sub: "This station's daily-mean record has not yet produced three consecutive days at or above 25 °C.",
  };
}

/**
 * "27 hot days by 1 August · 2003 had 31 by the same date" — the year in
 * progress compared only against the same calendar cutoff, never against a
 * completed year's final total (see `heatDaysToDate`).
 */
export function buildHeatDaysTile(rows: YearToDate[], year: number, dateLabel: string): string {
  const current = rows.find((r) => r.year === year) ?? null;
  if (current === null || current.days === null) {
    return 'Not enough data yet this year to count hot days reliably.';
  }

  const complete = rows.filter((r): r is YearToDate & { days: number } => r.days !== null);
  const record = complete.length > 0 ? complete.reduce((a, b) => (b.days > a.days ? b : a)) : null;
  const currentPhrase = `${plural(current.days, 'hot day')} by ${dateLabel}`;

  if (record === null) return `${currentPhrase}.`;
  if (record.year === year) return `${currentPhrase} — the most on record for this date.`;
  return `${currentPhrase} · ${record.year} had ${record.days} by the same date.`;
}

/**
 * "1900s: 1.2 hot days/year · 2020s: 9.4 · +8.2" — mirrors the wording the
 * threshold chart's own trend line already uses, so the two can't read as
 * two different claims about the same shift.
 */
export function buildLongTermTile(
  change: { from: DecadeSummary; to: DecadeSummary; delta: number } | null,
): string {
  if (change === null) return 'Not enough complete decades yet to show a long-term shift.';
  const sign = change.delta >= 0 ? '+' : '−';
  return (
    `${change.from.decade}s: ${change.from.perYear.toFixed(1)} hot days/year · ` +
    `${change.to.decade}s: ${change.to.perYear.toFixed(1)} · ${sign}${Math.abs(change.delta).toFixed(1)}`
  );
}
