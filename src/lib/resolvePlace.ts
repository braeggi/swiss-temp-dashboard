import type { SourcePlan, StationIndexEntry } from '../types';
import { nearestStation } from './geo';

export const LIVE_RADIUS_KM = 15;

const RAW_SERIES_CAVEAT =
  'Raw measured series, not homogenised — station moves and instrument changes are ' +
  'not corrected for, so part of any trend may be an artifact.';

function homogenisationCaveats(station: StationIndexEntry): string[] {
  return station.homogenised ? [] : [RAW_SERIES_CAVEAT];
}

/** The user picked an official station, so both slots are that station. */
export function resolveStation(station: StationIndexEntry): SourcePlan {
  return {
    label: station.name,
    historyStation: station,
    liveStation: station,
    liveDistanceKm: 0,
    caveats: [
      `Series from ${station.name} (${station.altitude} m), ${station.fromYear}–${station.toYear}.`,
      ...homogenisationCaveats(station),
    ],
  };
}

/**
 * The user picked a geocoded place. Borrow the nearest station inside
 * LIVE_RADIUS_KM for both slots; otherwise fall back to Open-Meteo entirely.
 */
export function resolveGeocoded(
  place: { name: string; lat: number; lon: number },
  all: StationIndexEntry[],
): SourcePlan {
  const near = nearestStation(all, place);
  if (near === null || near.km > LIVE_RADIUS_KM) {
    return {
      label: place.name,
      historyStation: null,
      liveStation: null,
      liveDistanceKm: null,
      caveats: [
        `No MeteoSwiss station within ${LIVE_RADIUS_KM} km of ${place.name}.`,
        'Using Open-Meteo reanalysis from 1940 — modelled on a ~9 km grid, not a station measurement.',
      ],
    };
  }

  const km = Math.round(near.km * 10) / 10;
  return {
    label: place.name,
    historyStation: near.station,
    liveStation: near.station,
    liveDistanceKm: km,
    caveats: [
      `Measured at ${near.station.name}, ${km} km away, ${near.station.altitude} m.`,
      `Series covers ${near.station.fromYear}–${near.station.toYear}.`,
      ...homogenisationCaveats(near.station),
    ],
  };
}
