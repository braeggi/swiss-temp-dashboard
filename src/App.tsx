// src/App.tsx
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useDashboardState } from './hooks/useDashboardState';
import { PlacePicker } from './components/PlacePicker';
import { LazyOnVisible } from './components/LazyOnVisible';
import { AnswerSection } from './sections/AnswerSection';
import { SourceNote } from './components/SourceNote';
import { parseIso } from './lib/dateUtil';
import type { ViewMode } from './components/ViewToggle';
import './styles.css';

const DayEvidence = lazy(() => import('./sections/DayEvidence'));
const YearEvidence = lazy(() => import('./sections/YearEvidence'));
const TrendEvidence = lazy(() => import('./sections/TrendEvidence'));
const StripesEvidence = lazy(() => import('./sections/StripesEvidence'));

const SECTION_ID: Record<ViewMode, string> = {
  day: 'evidence-day',
  year: 'evidence-year',
  threshold: 'evidence-trend',
};

export function App() {
  const s = useDashboardState();
  const scrolledToLegacyView = useRef(false);

  // An old ?view=... link should land the reader at the right section once.
  // The address-bar sync effect inside useDashboardState never writes `view`
  // back, so it does not reappear after this.
  useEffect(() => {
    if (s.legacyView === undefined || scrolledToLegacyView.current) return;
    const targetId = SECTION_ID[s.legacyView];

    const tryScroll = () => {
      const el = document.getElementById(targetId);
      if (el === null) return false;
      el.scrollIntoView({ behavior: 'auto' });
      scrolledToLegacyView.current = true;
      return true;
    };

    if (tryScroll()) return;

    // The lazy-loaded evidence sections mount once their chunk resolves,
    // which happens independently of any state change in this component —
    // React re-renders from the Suspense boundary down, not from App, so no
    // prop/state dependency can catch that moment. Watch the DOM directly
    // instead: it fires on the station-index load mounting the section
    // shell AND, separately, on the lazy chunk swapping in the real content.
    const observer = new MutationObserver(() => {
      if (tryScroll()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [s.legacyView]);

  if (s.indexError) {
    return (
      <main className="app">
        <p className="error">{s.indexError}</p>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="masthead">
        <h1>Swiss heat — how bad is it right now?</h1>
      </header>

      {/* The answer column. It stays put while the evidence scrolls past, so the
          verdict is still on screen when you are halfway through the working. */}
      <div className="rail">
        <PlacePicker
          index={s.index}
          selected={s.selected}
          onSelect={s.selectStation}
          onSelectPlace={s.setPlace}
          searchPlaces={s.geocodeSearch}
        />

        {s.loading && <p className="status">Loading {s.selected?.name}…</p>}
        {s.error && <p className="error">{s.error}</p>}
        {s.liveStale && s.isToday && (
          <p className="status">
            This station's live feed has not reported in over two hours — showing history only.
          </p>
        )}

        {s.plan && (s.place !== null || s.station) && (
          <>
            <AnswerSection
              station={s.station}
              isPlace={s.place !== null}
              effectiveSoFar={s.isToday ? s.effectiveSoFar : null}
              headline={s.headline}
              placeLabel={s.plan.label}
              viewedDateLabel={s.dateLabel}
              metric={s.metric}
              liveStationName={s.plan.liveStation?.name ?? null}
              liveDistanceKm={s.plan.liveDistanceKm}
              today={s.today}
            />

            <SourceNote plan={s.plan} usesOpenMeteo={s.place !== null} />
          </>
        )}
      </div>

      <div className="stream">
        {s.plan && (s.place !== null || s.station) && (
          <>
            <LazyOnVisible forceVisible={s.legacyView === 'day'}>
              <Suspense fallback={<p className="status">Loading chart…</p>}>
                <DayEvidence
                  date={s.date}
                  today={s.today}
                  onDateChange={s.setDate}
                  metric={s.metric}
                  onMetricChange={s.setMetric}
                  windowDays={s.windowDays}
                  onWindowChange={s.setWindowDays}
                  windowDisabled={s.place !== null}
                  points={s.points}
                  dateLabel={s.dateLabel}
                  todayValue={s.isToday ? s.todayMarkerValue : s.selectedYearValue}
                  todayYear={parseIso(s.isToday ? s.today : s.date).year}
                  homogenised={s.station?.homogenised ?? false}
                  norm={s.dayNorm}
                />
              </Suspense>
            </LazyOnVisible>

            <LazyOnVisible forceVisible={s.legacyView === 'year'}>
              <Suspense fallback={<p className="status">Loading chart…</p>}>
                <YearEvidence
                  station={s.station}
                  isPlace={s.place !== null}
                  year={parseIso(s.date).year}
                  homogenised={s.station?.homogenised ?? false}
                />
              </Suspense>
            </LazyOnVisible>

            <LazyOnVisible forceVisible={s.legacyView === 'threshold'}>
              <Suspense fallback={<p className="status">Loading chart…</p>}>
                <TrendEvidence
                  station={s.station}
                  isPlace={s.place !== null}
                  threshold={s.threshold}
                  onThresholdChange={s.setThreshold}
                  homogenised={s.station?.homogenised ?? false}
                />
              </Suspense>
            </LazyOnVisible>

            {/* Last, because it is the widest lens: one bar per year, the whole
                record at once, no axis to read. */}
            <LazyOnVisible>
              <Suspense fallback={<p className="status">Loading chart…</p>}>
                <StripesEvidence
                  station={s.station}
                  isPlace={s.place !== null}
                  homogenised={s.station?.homogenised ?? false}
                />
              </Suspense>
            </LazyOnVisible>
          </>
        )}
      </div>
    </main>
  );
}
