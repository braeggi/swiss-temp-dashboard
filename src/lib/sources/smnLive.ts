import { decodeLatin1 } from '../csv';
import { parseLiveCsv, type Reading } from '../dayAggregate';
import type { FetchLike } from './stationIndex';

const BASE = 'https://data.geo.admin.ch';

/**
 * Today's 10-minute readings. Returns [] rather than throwing: a missing live
 * file must degrade the headline card, not break the history chart.
 */
export async function loadLive(
  abbr: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<Reading[]> {
  const lower = abbr.toLowerCase();
  const url = `${BASE}/ch.meteoschweiz.ogd-smn/${lower}/ogd-smn_${lower}_t_now.csv`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return [];
    return parseLiveCsv(decodeLatin1(await res.arrayBuffer()));
  } catch {
    return [];
  }
}
