// src/hooks/useStationSeries.ts
import { useEffect, useState } from 'react';
import type { PackedStation } from '../types';
import { loadPackedStation, mergeRecent } from '../lib/sources/packedStation';
import { loadLive } from '../lib/sources/smnLive';
import { daySoFar, isStale, readingsOnZurichDate, type DaySoFar } from '../lib/dayAggregate';

/** The caller's current Europe/Zurich calendar date, as `YYYY-MM-DD`. */
function currentZurichDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export interface StationSeriesState {
  station: PackedStation | null;
  soFar: DaySoFar | null;
  /** True when a live file was found but its newest reading is over 2 h old. */
  liveStale: boolean;
  loading: boolean;
  error: string | null;
}

export function useStationSeries(abbr: string | null): StationSeriesState {
  const [state, setState] = useState<StationSeriesState>({
    station: null,
    soFar: null,
    liveStale: false,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (abbr === null) {
      setState({ station: null, soFar: null, liveStale: false, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const base = await loadPackedStation(abbr);
        if (cancelled) return;
        const station = await mergeRecent(base);
        if (cancelled) return;
        // Live data is best-effort; loadLive already swallows its own failures.
        const readings = await loadLive(abbr);
        if (cancelled) return;

        // _t_now.csv is scoped to a single UTC day, which doesn't line up
        // with the Swiss local day for 1–2 hours around local midnight.
        // Aggregate only the readings that actually fall on today's
        // Europe/Zurich calendar date, not whatever UTC day the feed holds.
        const now = new Date();
        const todaysReadings = readingsOnZurichDate(readings, currentZurichDay(now));

        // A station that stopped reporting hours ago must not be presented as
        // "now" — drop the aggregate and let the UI say the live feed is stale.
        // Just after local midnight, todaysReadings may legitimately be empty
        // (the local day has barely started); daySoFar already returns null
        // for that, which degrades the same way a missing feed does.
        const aggregate = daySoFar(todaysReadings);
        const stale = aggregate !== null && isStale(aggregate.latest, now);

        setState({
          station,
          soFar: stale ? null : aggregate,
          liveStale: stale,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          station: null,
          soFar: null,
          liveStale: false,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [abbr]);

  return state;
}
