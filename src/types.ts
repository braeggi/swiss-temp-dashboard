export type Metric = 'mean' | 'max' | 'min';

/** Which upstream collection a station's history came from. */
export type HistorySource = 'nbcn' | 'smn' | 'openmeteo';

/** A station's full daily history, packed into fixed-stride integer arrays. */
export interface PackedStation {
  abbr: string;
  name: string;
  canton: string;
  lat: number;
  lon: number;
  altitude: number;
  source: HistorySource;
  homogenised: boolean;
  fromYear: number;
  toYear: number;
  /** Each array has (toYear - fromYear + 1) * 366 entries. Values are °C × 10. */
  mean: number[];
  max: number[];
  min: number[];
}

/** One row of public/data/stations.json — enough to search and label without loading history. */
export interface StationIndexEntry {
  abbr: string;
  name: string;
  canton: string;
  lat: number;
  lon: number;
  altitude: number;
  source: HistorySource;
  homogenised: boolean;
  fromYear: number;
  toYear: number;
}

/** One year's value for the selected calendar day. */
export interface DayPoint {
  year: number;
  value: number;
}

export interface SourcePlan {
  label: string;
  historyStation: StationIndexEntry | null;
  liveStation: StationIndexEntry | null;
  liveDistanceKm: number | null;
  caveats: string[];
}
