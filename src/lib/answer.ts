import type { HeatState } from './heatEpisodes';
import type { DecadeSummary, YearToDate } from './thresholdDays';
import type { FrequencyShift } from './returnPeriod';
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

/** Bands where the change is not worth dressing up as a multiplier. */
const FLAT_LOW = 0.95;
const FLAT_HIGH = 1.05;

/**
 * "5.4× as often as it used to be — days at least this warm ran 2.1 a year in
 * 1864–1893, 11.4 in 1996–2025."
 *
 * A rank says how hot today is. This says how the climate around it moved, in
 * the one unit a reader can check against their own memory: how often.
 *
 * Both windows are named, and not only because "the first thirty years" starts
 * in 1864 at one station and 1959 at the next. Without the second span, "11.4 a
 * year" reads as this year's count rather than as a thirty-year average.
 */
export function buildFrequencyTile(shift: FrequencyShift | null): string | null {
  if (shift === null) return null;
  const { early, recent, direction, factor } = shift;
  const kind = direction === 'warm' ? 'warm' : 'cold';
  const ran =
    `days at least this ${kind} ran ${early.perYear.toFixed(1)} a year in ` +
    `${early.fromYear}–${early.toYear}, ${recent.perYear.toFixed(1)} in ` +
    `${recent.fromYear}–${recent.toYear}`;

  // A bare ratio prints "Infinity× as often" here, which is both ugly and less
  // informative than the plain fact.
  if (factor === null) {
    return (
      `Did not happen at all in ${early.fromYear}–${early.toYear} — ` +
      `${recent.perYear.toFixed(1)} days a year at least this ${kind} in ` +
      `${recent.fromYear}–${recent.toYear}.`
    );
  }

  if (factor > FLAT_HIGH) {
    const times = factor >= 10 ? factor.toFixed(0) : factor.toFixed(1);
    return `${times}× as often as it used to be — ${ran}.`;
  }

  // "0.4× as often" reads as a multiplier of something that shrank, which is a
  // sentence people have to translate. State the fall as a fall.
  if (factor < FLAT_LOW) {
    return `Down to ${Math.round(factor * 100)} % of the old rate — ${ran}.`;
  }

  return `About as often as it used to be — ${ran}.`;
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
