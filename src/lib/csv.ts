/**
 * MeteoSwiss CSVs are ISO-8859-1. Decoding them as UTF-8 throws on station
 * names like "Grächen" and "Château-d'Oex".
 */
export function decodeLatin1(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // A few files are served with a UTF-8 BOM despite being latin-1 elsewhere.
  const body =
    view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf ? view.subarray(3) : view;
  return new TextDecoder('iso-8859-1').decode(body);
}

export function parseSemicolonCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split('\n');
  const parsed: string[][] = [];
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '');
    if (trimmed.trim() === '') continue;
    parsed.push(trimmed.split(';'));
  }
  if (parsed.length === 0) return { header: [], rows: [] };
  return { header: parsed[0], rows: parsed.slice(1) };
}

const SWISS_DATE = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+\d{2}:\d{2})?$/;

export function parseSwissDate(s: string): { year: number; month: number; day: number } {
  const m = SWISS_DATE.exec(s.trim());
  if (!m) throw new Error(`Unrecognised date format: "${s}"`);
  return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
}

export function columnIndex(header: string[], name: string): number {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Column "${name}" not found in header: ${header.join(',')}`);
  return i;
}

export function parseNumberOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
