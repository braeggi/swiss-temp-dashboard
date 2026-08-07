import type { StationIndexEntry } from '../types';
import { formatZurichTime, type DaySoFar } from '../lib/dayAggregate';
import { PlacePicker, type GeocodedPlace } from './PlacePicker';

// Non-breaking space: on a phone the masthead otherwise breaks between the
// figure and its unit, stranding “°C” on a line of its own.
const fmt = (n: number) => `${n.toFixed(1)} °C`;

export interface StationBarProps {
  /** The place the page is about, already resolved to a display name. */
  placeLabel: string;
  /** Where the history comes from. Null before the index has loaded. */
  historyStation: StationIndexEntry | null;
  /** Where the live reading comes from — may be a neighbour of the above. */
  liveStationName: string | null;
  liveDistanceKm: number | null;
  soFar: DaySoFar | null;
  index: StationIndexEntry[];
  selected: StationIndexEntry | null;
  onSelect: (station: StationIndexEntry) => void;
  onSelectPlace: (place: GeocodedPlace) => void;
  searchPlaces: (query: string) => Promise<GeocodedPlace[]>;
}

/**
 * The page's masthead: which place this is, what it reads right now, and the
 * one control that changes both.
 *
 * These used to sit at the top of the answer column. The column is for the
 * verdict — what the day amounts to — and the identity of the station is not
 * that; it is the frame the whole page hangs in, including the evidence
 * sections the column does not cover.
 */
export function StationBar({
  placeLabel,
  historyStation,
  liveStationName,
  liveDistanceKm,
  soFar,
  index,
  selected,
  onSelect,
  onSelectPlace,
  searchPlaces,
}: StationBarProps) {
  const latest = soFar?.latest;
  const clock = latest ? formatZurichTime(latest) : null;

  // The live feed often comes from a neighbouring station. Naming it only when
  // it differs keeps the line short without ever hiding the borrowing.
  const borrowed = liveStationName !== null && liveStationName !== placeLabel;

  return (
    <div className="station-bar">
      <div className="station-id">
        {/* The space belongs between the two spans, not inside the second one:
            the reading is `white-space: nowrap`, so a leading space swallowed
            into it leaves the line with no break opportunity at all, and a long
            station name then pushes the reading off the screen. */}
        <h1>
          <span className="reading-place">{placeLabel}</span>{' '}
          {latest && <span className="reading-now">· now {fmt(latest.celsius)}</span>}
        </h1>
        <p className="station-meta">
          {historyStation && (
            <>
              {historyStation.altitude} m · since {historyStation.fromYear}
            </>
          )}
          {borrowed && (
            <>
              {' · '}
              {liveStationName}
              {liveDistanceKm !== null && liveDistanceKm > 0 && <> · {liveDistanceKm} km</>}
            </>
          )}
          {clock && <> · {clock}</>}
        </p>
      </div>

      <PlacePicker
        index={index}
        selected={selected}
        onSelect={onSelect}
        onSelectPlace={onSelectPlace}
        searchPlaces={searchPlaces}
      />
    </div>
  );
}
