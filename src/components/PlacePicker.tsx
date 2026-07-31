import { useEffect, useMemo, useState } from 'react';
import type { StationIndexEntry } from '../types';

/**
 * Strip diacritics so "zurich" finds "Zürich" and "grachen" finds "Grächen".
 * U+0300-U+036F is the combining-diacritical-marks block that NFD splits off.
 */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function searchStations(
  index: StationIndexEntry[],
  query: string,
  limit = 12,
): StationIndexEntry[] {
  const q = fold(query.trim());
  if (q === '') return [];

  const scored: Array<{ s: StationIndexEntry; score: number }> = [];
  for (const s of index) {
    const name = fold(s.name);
    const abbr = fold(s.abbr);
    const canton = fold(s.canton);
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (abbr === q) score = 1;
    else if (name.includes(q)) score = 2;
    else if (canton === q) score = 3;
    if (score >= 0) scored.push({ s, score });
  }
  scored.sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name));
  return scored.slice(0, limit).map((x) => x.s);
}

export interface GeocodedPlace {
  name: string;
  lat: number;
  lon: number;
  altitude: number;
}

export interface PlacePickerProps {
  index: StationIndexEntry[];
  selected: StationIndexEntry | null;
  onSelect: (station: StationIndexEntry) => void;
  /** Called when the user picks a geocoded place with no matching station. */
  onSelectPlace?: (place: GeocodedPlace) => void;
  /** Injected so App can supply the Open-Meteo geocoder. */
  searchPlaces?: (query: string) => Promise<GeocodedPlace[]>;
}

export function PlacePicker({
  index,
  selected,
  onSelect,
  onSelectPlace,
  searchPlaces,
}: PlacePickerProps) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const results = useMemo(() => searchStations(index, query), [index, query]);

  // Only reach for the geocoder when no station matches — most queries never do.
  useEffect(() => {
    if (!searchPlaces || query.trim().length < 3 || results.length > 0) {
      setPlaces([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPlaces(query)
        .then((p) => !cancelled && setPlaces(p))
        .catch(() => !cancelled && setPlaces([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, results.length, searchPlaces]);

  return (
    <div className="place-picker">
      <label htmlFor="place">Station or place</label>
      <input
        id="place"
        type="search"
        value={query}
        placeholder={selected ? selected.name : 'Aarau, Basel, Davos…'}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {(results.length > 0 || places.length > 0) && (
        <ul className="place-results">
          {results.map((s) => (
            <li key={s.abbr}>
              <button
                type="button"
                onClick={() => {
                  onSelect(s);
                  setQuery('');
                }}
              >
                <span className="place-name">{s.name}</span>
                <span className="place-meta">
                  {s.canton} · {s.altitude} m · from {s.fromYear}
                  {s.homogenised ? ' · homogenised' : ''}
                </span>
              </button>
            </li>
          ))}
          {places.map((p) => (
            <li key={`${p.name}-${p.lat}-${p.lon}`}>
              <button type="button" onClick={() => { onSelectPlace?.(p); setQuery(''); }}>
                <span className="place-name">{p.name}</span>
                <span className="place-meta">
                  no station nearby · {Math.round(p.altitude)} m · Open-Meteo from 1940
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
