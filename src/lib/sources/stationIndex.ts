import type { StationIndexEntry } from '../../types';

export type FetchLike = typeof globalThis.fetch;

export async function loadStationIndex(
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<StationIndexEntry[]> {
  const res = await fetchImpl('data/stations.json');
  if (!res.ok) throw new Error(`Cannot load station index (${res.status})`);
  return (await res.json()) as StationIndexEntry[];
}
