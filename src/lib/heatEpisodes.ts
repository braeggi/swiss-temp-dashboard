import type { PackedStation } from '../types';
import { SLOTS_PER_YEAR, decodeValue, metricArray, monthDayOfSlot, indexFor } from './packed';
import { isLeapYear, parseIso } from './dateUtil';

/**
 * The heat-wave definition in common Swiss use: a daily *mean* of at least
 * 25 °C sustained over at least three consecutive days.
 *
 * The mean matters. A single 31 °C afternoon that cools to 14 °C overnight is
 * a hot day, not a heat wave; what makes a heat wave is that the whole day
 * stays warm, night included.
 */
export const HEATWAVE_MIN_MEAN = 25;
export const HEATWAVE_MIN_DAYS = 3;

export interface HeatEpisode {
  /** Absolute index into the packed array, first day of the episode. */
  startIndex: number;
  /** Absolute index, last day, inclusive. */
  endIndex: number;
  /** Calendar year of the first day. */
  year: number;
  startDate: string;
  endDate: string;
  /** Completed days. Never includes a day still in progress. */
  days: number;
  peakMean: number;
  meanOfMeans: number;
  /** Set in a later pass: readings are missing immediately before or after. */
  gapAdjacent: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Absolute packed index -> ISO date. */
function isoOfIndex(fromYear: number, index: number): string {
  const year = fromYear + Math.floor(index / SLOTS_PER_YEAR);
  const { month, day } = monthDayOfSlot(index % SLOTS_PER_YEAR);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Slot 59 (Feb 29) exists in every year's packed layout, but 29 February
 * itself does not exist in a common year — there is no calendar day to have
 * a data gap in. Treating that phantom slot as missing data would falsely
 * split (or gap-flag) an episode that in reality runs straight through the
 * turn of the month.
 */
function isPhantomSlot(fromYear: number, index: number): boolean {
  const year = fromYear + Math.floor(index / SLOTS_PER_YEAR);
  return index % SLOTS_PER_YEAR === 59 && !isLeapYear(year);
}

/**
 * Every heat episode in the station's record, oldest first.
 *
 * The walk runs across the whole array rather than year by year, which costs
 * nothing and removes two special cases: Feb 29 in a common year is a
 * phantom slot (see `isPhantomSlot`) that is skipped rather than treated as
 * a data gap, and an episode spanning New Year falls out correctly instead
 * of resting on an assumption that one never happens.
 */
export function findHeatEpisodes(st: PackedStation): HeatEpisode[] {
  const arr = metricArray(st, 'mean');
  const out: HeatEpisode[] = [];

  // The covered range is the span that actually holds measurements. Outside
  // it, MISSING means "before the record began" or "has not happened yet" —
  // neither is a gap, and flagging the current year's running episode as
  // gap-adjacent every single day would make the flag meaningless.
  let firstData = -1;
  let lastData = -1;
  for (let i = 0; i < arr.length; i++) {
    if (decodeValue(arr[i]) !== null) {
      if (firstData === -1) firstData = i;
      lastData = i;
    }
  }

  let start = -1;
  let sum = 0;
  let peak = -Infinity;
  // A phantom slot inside a run must not inflate its day count: it is not a
  // real calendar day, so it is subtracted back out when the run closes.
  let phantomsInRun = 0;

  /** The real neighbouring index, stepping over a phantom Feb-29 slot if one sits there. */
  const realPredecessor = (index: number) =>
    isPhantomSlot(st.fromYear, index - 1) ? index - 2 : index - 1;
  const realSuccessor = (index: number) =>
    isPhantomSlot(st.fromYear, index + 1) ? index + 2 : index + 1;

  const close = (endIndex: number) => {
    const days = endIndex - start + 1 - phantomsInRun;
    if (days >= HEATWAVE_MIN_DAYS) {
      out.push({
        startIndex: start,
        endIndex,
        year: st.fromYear + Math.floor(start / SLOTS_PER_YEAR),
        startDate: isoOfIndex(st.fromYear, start),
        endDate: isoOfIndex(st.fromYear, endIndex),
        days,
        peakMean: peak,
        meanOfMeans: sum / days,
        gapAdjacent:
          (start > firstData && decodeValue(arr[realPredecessor(start)]) === null) ||
          (endIndex < lastData && decodeValue(arr[realSuccessor(endIndex)]) === null),
      });
    }
    start = -1;
    sum = 0;
    peak = -Infinity;
    phantomsInRun = 0;
  };

  for (let i = 0; i < arr.length; i++) {
    if (isPhantomSlot(st.fromYear, i)) {
      // Does not exist as a calendar day: cannot break a run, cannot extend
      // one, and does not count toward its length.
      if (start !== -1) phantomsInRun++;
      continue;
    }
    const v = decodeValue(arr[i]);
    if (v !== null && v >= HEATWAVE_MIN_MEAN) {
      if (start === -1) start = i;
      sum += v;
      if (v > peak) peak = v;
    } else if (start !== -1) {
      close(i - 1);
    }
  }
  if (start !== -1) close(arr.length - 1);

  return out;
}

/**
 * MeteoSwiss's daily "recent" file — merged in by `mergeRecent` — lags real
 * time by design: about 1 day for SMN stations, up to 2 for NBCN (observed
 * directly against the live feeds while reviewing this branch). That much
 * silence is normal reporting latency, not a broken feed, so "still
 * running" is judged against the packed series' own newest reading, not
 * against yesterday specifically. Beyond this many days of silence, though,
 * it is no longer latency — something upstream has stopped reporting, and
 * claiming a wave continues would be stronger than the data can support.
 */
const MAX_REPORTING_LAG_DAYS = 3;

/** The most recent absolute index in the station's mean series holding a real reading. */
function lastMeasuredIndexOf(st: PackedStation): number | null {
  const arr = metricArray(st, 'mean');
  for (let i = arr.length - 1; i >= 0; i--) {
    if (decodeValue(arr[i]) !== null) return i;
  }
  return null;
}

export type HeatState =
  | {
      kind: 'running';
      episode: HeatEpisode;
      /** Includes today when its partial mean already clears the threshold. */
      dayNumber: number;
      todayProvisional: boolean;
      /** ISO date of the packed series' newest reading — may lag today by the
          recent-file's normal reporting latency (see MAX_REPORTING_LAG_DAYS). */
      measuredThroughIso: string;
    }
  | {
      kind: 'thisYear';
      year: number;
      /** Days at or above the threshold, whether or not they formed a wave. */
      qualifyingDays: number;
      lastEpisode: HeatEpisode | null;
    }
  | { kind: 'lastSummer'; year: number | null; longestEpisode: HeatEpisode | null };

/** Days in `year` whose mean reaches the heat-wave threshold. */
function qualifyingDaysIn(st: PackedStation, year: number): number {
  if (year < st.fromYear || year > st.toYear) return 0;
  const arr = metricArray(st, 'mean');
  const base = (year - st.fromYear) * SLOTS_PER_YEAR;
  let n = 0;
  for (let s = 0; s < SLOTS_PER_YEAR; s++) {
    const v = decodeValue(arr[base + s]);
    if (v !== null && v >= HEATWAVE_MIN_MEAN) n++;
  }
  return n;
}

/**
 * Which of the three things the page has to say today.
 *
 * `soFarMean` is the day-so-far mean from the live feed, or null when there
 * is none. It is deliberately never folded into `episode.days`: a partial day
 * is not a daily mean, and at 09:00 it is not the same quantity at all. It
 * can only extend the *day number*, which the caller must label as still in
 * progress.
 */
export function heatState(
  st: PackedStation,
  episodes: HeatEpisode[],
  todayIso: string,
  soFarMean: number | null,
): HeatState {
  const { year, month, day } = parseIso(todayIso);
  const todayIndex = indexFor(st.fromYear, year, month, day);

  const last = episodes.length > 0 ? episodes[episodes.length - 1] : null;
  const todayQualifies = soFarMean !== null && soFarMean >= HEATWAVE_MIN_MEAN;

  // "Still running" means the last episode reaches all the way to the
  // newest day the packed series actually has a reading for — not that it
  // reaches literally yesterday, since the recent-file merge normally lags
  // today by 1-2 days depending on the station's collection.
  const lastMeasuredIndex = lastMeasuredIndexOf(st);
  const reportingLagDays =
    lastMeasuredIndex === null ? Infinity : todayIndex - lastMeasuredIndex;

  if (
    last !== null &&
    lastMeasuredIndex !== null &&
    last.endIndex === lastMeasuredIndex &&
    reportingLagDays <= MAX_REPORTING_LAG_DAYS &&
    todayQualifies
  ) {
    return {
      kind: 'running',
      episode: last,
      dayNumber: last.days + 1,
      todayProvisional: true,
      measuredThroughIso: isoOfIndex(st.fromYear, lastMeasuredIndex),
    };
  }

  // State B keys off qualifying *days*, not episodes. Two warm days that never
  // reached three still mean this year has seen heat, and saying "last summer"
  // while the thermometer sat at 26 °C last week would be plainly wrong.
  const qualifyingDays = qualifyingDaysIn(st, year);
  if (qualifyingDays > 0) {
    const thisYear = episodes.filter((e) => e.year === year);
    return {
      kind: 'thisYear',
      year,
      qualifyingDays,
      lastEpisode: thisYear.length > 0 ? thisYear[thisYear.length - 1] : null,
    };
  }

  const earlier = episodes.filter((e) => e.year < year);
  if (earlier.length === 0) {
    return { kind: 'lastSummer', year: null, longestEpisode: null };
  }
  const lastYear = earlier[earlier.length - 1].year;
  const ofThatYear = earlier.filter((e) => e.year === lastYear);
  const longest = ofThatYear.reduce((a, b) => (b.days > a.days ? b : a));
  return { kind: 'lastSummer', year: lastYear, longestEpisode: longest };
}
