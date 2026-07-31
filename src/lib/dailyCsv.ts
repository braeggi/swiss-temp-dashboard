import type { Metric } from '../types';
import { columnIndex, parseNumberOrNull, parseSemicolonCsv, parseSwissDate } from './csv';
import { allocateSeries, encodeValue, indexFor } from './packed';

export type Collection = 'nbcn' | 'smn';

/**
 * The two collections publish the same three daily statistics under different
 * names: NBCN's are homogenised (`ths`), SMN's are raw measurements (`tre`).
 */
export const COLUMNS: Record<Collection, Record<Metric, string>> = {
  nbcn: { mean: 'ths200d0', max: 'ths200dx', min: 'ths200dn' },
  smn: { mean: 'tre200d0', max: 'tre200dx', min: 'tre200dn' },
};

export interface DailyRow {
  year: number;
  month: number;
  day: number;
  mean: number | null;
  max: number | null;
  min: number | null;
}

export function readDailyCsv(text: string, collection: Collection): DailyRow[] {
  const { header, rows } = parseSemicolonCsv(text);
  const cols = COLUMNS[collection];
  const ts = columnIndex(header, 'reference_timestamp');
  const iMean = columnIndex(header, cols.mean);
  const iMax = columnIndex(header, cols.max);
  const iMin = columnIndex(header, cols.min);

  const out: DailyRow[] = [];
  for (const r of rows) {
    const { year, month, day } = parseSwissDate(r[ts]);
    out.push({
      year,
      month,
      day,
      mean: parseNumberOrNull(r[iMean]),
      max: parseNumberOrNull(r[iMax]),
      min: parseNumberOrNull(r[iMin]),
    });
  }
  return out;
}

export function packRows(rows: DailyRow[]): {
  fromYear: number;
  toYear: number;
  mean: number[];
  max: number[];
  min: number[];
} {
  if (rows.length === 0) throw new Error('Cannot pack an empty row set');
  let fromYear = Infinity;
  let toYear = -Infinity;
  for (const r of rows) {
    if (r.year < fromYear) fromYear = r.year;
    if (r.year > toYear) toYear = r.year;
  }

  const mean = allocateSeries(fromYear, toYear);
  const max = allocateSeries(fromYear, toYear);
  const min = allocateSeries(fromYear, toYear);

  for (const r of rows) {
    const i = indexFor(fromYear, r.year, r.month, r.day);
    mean[i] = encodeValue(r.mean);
    max[i] = encodeValue(r.max);
    min[i] = encodeValue(r.min);
  }

  return { fromYear, toYear, mean, max, min };
}
