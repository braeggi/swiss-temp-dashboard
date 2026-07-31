// src/App.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Metric, StationIndexEntry } from './types';
import { loadStationIndex } from './lib/sources/stationIndex';
import { useStationSeries } from './hooks/useStationSeries';
import { dayAcrossYears, dayAcrossYearsWindowed, normDeviation } from './lib/series';
import { buildHeadline } from './lib/headline';
import { resolveStation } from './lib/resolvePlace';
import { formatDayLabel, isIsoDate, parseIso, todayIso } from './lib/dateUtil';
import { buildUrlSearch, parseUrlState } from './lib/urlState';
import { geocode, openMeteoDaily } from './lib/sources/openMeteo';
import { resolveGeocoded } from './lib/resolvePlace';
import type { DayPoint } from './types';
import type { GeocodedPlace } from './components/PlacePicker';
import { PlacePicker } from './components/PlacePicker';
import { DateControl } from './components/DateControl';
import { MetricToggle } from './components/MetricToggle';
import { WindowToggle, type WindowDays } from './components/WindowToggle';
import { ViewToggle, type ViewMode } from './components/ViewToggle';
import { YearOverviewChart } from './components/YearOverviewChart';
import { ThresholdChart } from './components/ThresholdChart';
import { ThresholdToggle } from './components/ThresholdToggle';
import { thresholdDays, type ThresholdKey } from './lib/thresholdDays';
import { yearOverview } from './lib/yearOverview';
import { CurrentReadingCard } from './components/CurrentReadingCard';
import { DayAcrossYearsChart } from './components/DayAcrossYearsChart';
import { SourceNote } from './components/SourceNote';
import './styles.css';

const DEFAULT_STATION = 'SMA'; // Zürich / Fluntern

export function App() {
  const today = todayIso();
  // Read once at mount. Every field is validated inside parseUrlState, so a
  // truncated or hand-edited link degrades field-by-field instead of failing
  // whole — and an impossible date can no longer reach the render path.
  const [initialUrl] = useState(() => parseUrlState(window.location.search));

  const [index, setIndex] = useState<StationIndexEntry[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StationIndexEntry | null>(null);
  const [date, setDate] = useState(initialUrl.date ?? today);
  const [metric, setMetric] = useState<Metric>(initialUrl.metric ?? 'mean');
  const [windowDays, setWindowDays] = useState<WindowDays>(initialUrl.windowDays ?? 0);
  const [view, setView] = useState<ViewMode>(initialUrl.view ?? 'day');
  const [threshold, setThreshold] = useState<ThresholdKey>(initialUrl.threshold ?? 'hotDays');
  const [place, setPlace] = useState<GeocodedPlace | null>(
    initialUrl.place ? { ...initialUrl.place, altitude: 0 } : null,
  );
  const [placePoints, setPlacePoints] = useState<Record<Metric, DayPoint[]> | null>(null);

  // Belt-and-braces: `date` must never hold a non-ISO value, since parseIso
  // and formatDayLabel below assume it unconditionally. DateControl already
  // filters at the source, but the invariant belongs where the state lives —
  // any future caller of this setter gets the same protection for free.
  const handleDateChange = (iso: string) => {
    if (isIsoDate(iso)) setDate(iso);
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
            : idx.find((s) => s.abbr === initialUrl.station);
        setSelected(fromUrl ?? idx.find((s) => s.abbr === DEFAULT_STATION) ?? idx[0] ?? null);
      })
      .catch((e: unknown) =>
        setIndexError(
          `Could not load the station index — did you run "npm run build:data"? (${
            e instanceof Error ? e.message : String(e)
          })`,
        ),
      );
  }, []);

  const { station, soFar, liveStale, loading, error } = useStationSeries(
    selected?.abbr ?? null,
  );
  const { month, day } = parseIso(date);
  const isToday = date === today;

  // Keep the address bar in step with the current selection so the page is
  // always linkable. replaceState, not pushState: the back button should leave
  // the app, not walk back through every metric toggle.
  useEffect(() => {
    if (index.length === 0) return; // pre-hydration; don't clobber the incoming link
    const search = buildUrlSearch({
      stationAbbr: place === null ? (selected?.abbr ?? null) : null,
      place: place === null ? null : { name: place.name, lat: place.lat, lon: place.lon },
      date,
      today,
      metric,
      windowDays,
      view,
      threshold,
    });
    const next = `${window.location.pathname}${search}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [index.length, selected, place, date, metric, windowDays, view, threshold, today]);

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

  const points = useMemo(() => {
    // Open-Meteo is fetched one calendar day at a time, so a geocoded place has
    // no neighbouring days to average — the control is disabled for it rather
    // than silently returning an unsmoothed series.
    if (place !== null) return placePoints?.[metric] ?? [];
    if (!station) return [];
    return windowDays === 0
      ? dayAcrossYears(station, month, day, metric)
      : dayAcrossYearsWindowed(station, month, day, metric, windowDays);
  }, [place, placePoints, station, month, day, metric, windowDays]);

  const selectedYearValue = useMemo(() => {
    if (isToday) return null;
    const { year } = parseIso(date);
    return points.find((p) => p.year === year)?.value ?? null;
  }, [isToday, date, points]);

  // A geocoded place has no live station feed of its own, so the day-so-far
  // reading — which belongs to whichever station happens to be loaded — must
  // not leak into its headline ranking, even though it's already withheld
  // from display.
  const effectiveSoFar = place === null ? soFar : null;

  const headline = useMemo(
    () =>
      buildHeadline({
        points,
        soFar: effectiveSoFar,
        metric,
        isToday,
        selectedYearValue,
        windowDays: place === null ? windowDays : 0,
      }),
    [points, effectiveSoFar, metric, isToday, selectedYearValue, place, windowDays],
  );

  // What to PLOT for today is not the same question as what to RANK. The rank is
  // withheld while a window is active (an unsmoothed day cannot be scored against
  // smoothed history) and until enough readings exist — but the measurement is
  // real either way, and hiding the marker just loses the user their own day.
  const todayMarkerValue = effectiveSoFar === null ? null : effectiveSoFar[metric];

  const yearDays = useMemo(() => {
    // Only station data has a full year to summarise; a geocoded place is
    // fetched one calendar day at a time, so the year view is disabled for it.
    if (view !== 'year' || place !== null || !station) return null;
    return yearOverview(station, metric, parseIso(date).year);
  }, [view, place, station, metric, date]);

  // The headline says "+6.3 °C vs the 1991-2020 norm"; the chart should show the
  // line that number is measured from, rather than making the reader hold it in
  // their head. Derived from the same helper so the two can't disagree.
  const dayNorm = useMemo(() => {
    if (points.length === 0) return null;
    const d = normDeviation(points, 0);
    return d === null ? null : -d;
  }, [points]);

  const thresholdRows = useMemo(() => {
    // Station data only: a geocoded place has one calendar day, not a record.
    if (view !== 'threshold' || place !== null || !station) return null;
    return thresholdDays(station, threshold);
  }, [view, place, station, threshold]);

  const plan = useMemo(() => {
    if (place !== null) return resolveGeocoded(place, index);
    return selected ? resolveStation(selected) : null;
  }, [place, selected, index]);

  if (indexError) return <main className="app"><p className="error">{indexError}</p></main>;

  return (
    <main className="app">
      <header>
        <h1>Swiss temperature — this day in history</h1>
      </header>

      <div className="controls">
        <PlacePicker
          index={index}
          selected={selected}
          onSelect={(s) => {
            setPlace(null);
            setSelected(s);
          }}
          onSelectPlace={setPlace}
          searchPlaces={(q) => geocode(q)}
        />
        {view !== 'threshold' && (
          <DateControl value={date} today={today} onChange={handleDateChange} />
        )}
        {view !== 'threshold' && <MetricToggle value={metric} onChange={setMetric} />}
        <ViewToggle value={view} onChange={setView} disabled={place !== null} />
        {view === 'day' && (
          <WindowToggle value={windowDays} onChange={setWindowDays} disabled={place !== null} />
        )}
        {view === 'threshold' && place === null && (
          <ThresholdToggle value={threshold} onChange={setThreshold} />
        )}
      </div>

      {loading && <p className="status">Loading {selected?.name}…</p>}
      {error && <p className="error">{error}</p>}
      {liveStale && isToday && (
        <p className="status">
          This station's live feed has not reported in over two hours — showing history only.
        </p>
      )}

      {plan && (place !== null || station) && (
        <>
          <CurrentReadingCard
            placeLabel={plan.label}
            dateLabel={formatDayLabel(date)}
            metric={metric}
            headline={headline}
            soFar={isToday ? effectiveSoFar : null}
            liveStationName={plan.liveStation?.name ?? null}
            liveDistanceKm={plan.liveDistanceKm}
            /* The live reading is current state and belongs in every view. The
               rank against one calendar day does not — the threshold view has no
               date dimension at all, so showing "4th-warmest 31 July" there
               answers a question the page isn't asking. */
            showVerdict={view !== 'threshold'}
          />

          {thresholdRows !== null ? (
            <ThresholdChart
              rows={thresholdRows}
              threshold={threshold}
              homogenised={station?.homogenised ?? false}
            />
          ) : yearDays !== null ? (
            <YearOverviewChart
              days={yearDays}
              metric={metric}
              year={parseIso(date).year}
              homogenised={station?.homogenised ?? false}
            />
          ) : (
          <DayAcrossYearsChart
            points={points}
            metric={metric}
            dateLabel={formatDayLabel(date)}
            todayValue={isToday ? todayMarkerValue : selectedYearValue}
            todayYear={parseIso(isToday ? today : date).year}
            homogenised={station?.homogenised ?? false}
            windowDays={place === null ? windowDays : 0}
            norm={dayNorm}
          />
          )}

          <SourceNote plan={plan} usesOpenMeteo={place !== null} />
        </>
      )}
    </main>
  );
}
