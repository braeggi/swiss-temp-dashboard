import type { Metric } from '../types';
import { isIsoDate } from './dateUtil';
import { isWindowDays, type WindowDays } from '../components/WindowToggle';
import { isViewMode, type ViewMode } from '../components/ViewToggle';
import { isThresholdKey, type ThresholdKey } from './thresholdDays';

/**
 * The shareable part of the app's state, as carried in the query string.
 *
 * Every field is optional and independently validated: a link may be truncated,
 * hand-edited, or built against an older version of the app. Anything that does
 * not parse is dropped rather than defaulted, so a partly-broken link still
 * restores the parts that are intact instead of failing whole.
 */
export interface UrlState {
  /** Station abbreviation, e.g. "BUS". Uppercased on read. */
  station?: string;
  /** Geocoded place with no nearby station. Requires all three fields. */
  place?: { name: string; lat: number; lon: number };
  date?: string;
  metric?: Metric;
  /** Averaging half-width in days; 0 is the single calendar day. */
  windowDays?: WindowDays;
  /** Which chart is shown. */
  view?: ViewMode;
  /** Which threshold the hot-and-cold-days view counts. */
  threshold?: ThresholdKey;
}

const METRICS: readonly Metric[] = ['mean', 'max', 'min'];

const isMetric = (s: string): s is Metric => (METRICS as readonly string[]).includes(s);

/** Station abbreviations are 3 letters in the MeteoSwiss networks (e.g. SMA, BUS). */
const ABBR = /^[A-Za-z]{3}$/;

function finiteInRange(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function parseUrlState(search: string): UrlState {
  const q = new URLSearchParams(search);
  const out: UrlState = {};

  const station = q.get('station');
  if (station !== null && ABBR.test(station)) out.station = station.toUpperCase();

  // A place needs all three parts to be meaningful; a name without coordinates
  // would send us back to the geocoder and might resolve somewhere else.
  const name = q.get('place');
  const lat = finiteInRange(q.get('lat'), -90, 90);
  const lon = finiteInRange(q.get('lon'), -180, 180);
  if (name !== null && name.trim() !== '' && lat !== null && lon !== null) {
    out.place = { name, lat, lon };
  }

  const date = q.get('date');
  if (date !== null && isIsoDate(date)) out.date = date;

  const metric = q.get('metric');
  if (metric !== null && isMetric(metric)) out.metric = metric;

  const w = q.get('window');
  if (w !== null) {
    const n = Number(w);
    if (Number.isInteger(n) && isWindowDays(n)) out.windowDays = n;
  }

  const view = q.get('view');
  if (view !== null && isViewMode(view)) out.view = view;

  const threshold = q.get('threshold');
  if (threshold !== null && isThresholdKey(threshold)) out.threshold = threshold;

  return out;
}

/**
 * Build the query string for the current state.
 *
 * Omits anything at its default so a plain link stays short, and never emits
 * both `station` and `place` — they are mutually exclusive selections.
 */
export function buildUrlSearch(state: {
  stationAbbr: string | null;
  place: { name: string; lat: number; lon: number } | null;
  date: string;
  today: string;
  metric: Metric;
  windowDays: WindowDays;
  view: ViewMode;
  threshold: ThresholdKey;
}): string {
  const q = new URLSearchParams();

  if (state.place !== null) {
    q.set('place', state.place.name);
    // Five decimals is ~1 m — far finer than a 9 km reanalysis grid cell, and
    // keeps the link readable.
    q.set('lat', state.place.lat.toFixed(5));
    q.set('lon', state.place.lon.toFixed(5));
  } else if (state.stationAbbr !== null) {
    q.set('station', state.stationAbbr);
  }

  if (state.date !== state.today) q.set('date', state.date);
  if (state.metric !== 'mean') q.set('metric', state.metric);
  if (state.windowDays !== 0) q.set('window', String(state.windowDays));
  if (state.view !== 'day') q.set('view', state.view);
  if (state.threshold !== 'hotDays') q.set('threshold', state.threshold);

  const s = q.toString();
  return s === '' ? '' : `?${s}`;
}
