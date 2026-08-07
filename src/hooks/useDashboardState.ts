import { useEffect, useMemo, useState } from 'react';
import type { DayPoint, Metric, StationIndexEntry } from '../types';
import { loadStationIndex } from '../lib/sources/stationIndex';
import { useStationSeries } from './useStationSeries';
import { useDayComparison } from './useDayComparison';
import { resolveGeocoded, resolveStation } from '../lib/resolvePlace';
import { formatDayLabel, isIsoDate, parseIso, todayIso } from '../lib/dateUtil';
import { buildUrlSearch, parseUrlState, readLegacyViewParam } from '../lib/urlState';
import { geocode, openMeteoDaily } from '../lib/sources/openMeteo';
import type { GeocodedPlace } from '../components/PlacePicker';
import type { WindowDays } from '../components/WindowToggle';
import type { ThresholdKey } from '../lib/thresholdDays';

const DEFAULT_STATION = 'SMA'; // Zürich / Fluntern

export function useDashboardState() {
  const today = todayIso();
  // Read once at mount. Every field is validated inside parseUrlState, so a
  // truncated or hand-edited link degrades field-by-field instead of failing
  // whole — and an impossible date can no longer reach the render path.
  const [initialUrl] = useState(() => parseUrlState(window.location.search));
  const [legacyView] = useState(() => readLegacyViewParam(window.location.search));

  const [index, setIndex] = useState<StationIndexEntry[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StationIndexEntry | null>(null);
  const [date, setDateRaw] = useState(initialUrl.date ?? today);
  const [metric, setMetric] = useState<Metric>(initialUrl.metric ?? 'mean');
  const [windowDays, setWindowDays] = useState<WindowDays>(initialUrl.windowDays ?? 0);
  const [threshold, setThreshold] = useState<ThresholdKey>(initialUrl.threshold ?? 'hotDays');
  const [place, setPlace] = useState<GeocodedPlace | null>(
    initialUrl.place ? { ...initialUrl.place, altitude: 0 } : null,
  );
  const [placePoints, setPlacePoints] = useState<Record<Metric, DayPoint[]> | null>(null);

  // Belt-and-braces: `date` must never hold a non-ISO value, since parseIso
  // and formatDayLabel downstream assume it unconditionally.
  const setDate = (iso: string) => {
    if (isIsoDate(iso)) setDateRaw(iso);
  };

  const selectStation = (s: StationIndexEntry) => {
    setPlace(null);
    setSelected(s);
  };

  useEffect(() => {
    loadStationIndex()
      .then((idx) => {
        setIndex(idx);
        // A link may name a station that no longer exists (the index is rebuilt
        // from upstream), so fall through to the default rather than showing
        // an empty dashboard. A link naming a place instead leaves `selected`
        // as the default underneath, which the place branch renders over.
        const fromUrl =
          initialUrl.station === undefined
            ? undefined
            : idx.find((st) => st.abbr === initialUrl.station);
        setSelected(fromUrl ?? idx.find((st) => st.abbr === DEFAULT_STATION) ?? idx[0] ?? null);
      })
      .catch((e: unknown) =>
        setIndexError(
          `Could not load the station index — did you run "npm run build:data"? (${
            e instanceof Error ? e.message : String(e)
          })`,
        ),
      );
    // Deliberately runs once: `initialUrl` is itself frozen in a useState
    // initializer above, so it is stable across the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { station, soFar, liveStale, loading, error } = useStationSeries(selected?.abbr ?? null);
  const { month, day } = parseIso(date);
  const isToday = date === today;

  // Keep the address bar in step with the current selection so the page is
  // always linkable. replaceState, not pushState: the back button should leave
  // the app, not walk back through every control change.
  useEffect(() => {
    if (index.length === 0) return; // pre-hydration; don't clobber the incoming link
    const search = buildUrlSearch({
      stationAbbr: place === null ? (selected?.abbr ?? null) : null,
      place: place === null ? null : { name: place.name, lat: place.lat, lon: place.lon },
      date,
      today,
      metric,
      windowDays,
      threshold,
    });
    const next = `${window.location.pathname}${search}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [index.length, selected, place, date, metric, windowDays, threshold, today]);

  // A geocoded place has no station file, so fetch its series from Open-Meteo.
  useEffect(() => {
    if (place === null) {
      setPlacePoints(null);
      return;
    }
    let cancelled = false;
    const { year } = parseIso(date);
    openMeteoDaily(place.lat, place.lon, month, day, year)
      .then((r) => !cancelled && setPlacePoints(r))
      .catch(() => !cancelled && setPlacePoints(null));
    return () => {
      cancelled = true;
    };
  }, [place, month, day, date]);

  const dayComparison = useDayComparison({
    place, placePoints, station, soFar, date, today, metric, windowDays,
  });

  const plan = useMemo(() => {
    if (place !== null) return resolveGeocoded(place, index);
    return selected ? resolveStation(selected) : null;
  }, [place, selected, index]);

  return {
    today,
    date,
    setDate,
    dateLabel: formatDayLabel(date),
    isToday,
    metric,
    setMetric,
    windowDays,
    setWindowDays,
    threshold,
    setThreshold,
    index,
    indexError,
    selected,
    selectStation,
    place,
    setPlace,
    station,
    soFar,
    liveStale,
    loading,
    error,
    plan,
    legacyView,
    geocodeSearch: (q: string) => geocode(q),
    ...dayComparison,
  };
}
