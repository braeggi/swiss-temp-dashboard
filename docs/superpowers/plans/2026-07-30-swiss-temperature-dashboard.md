# Swiss Temperature Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static dashboard where you pick one of 149 MeteoSwiss stations and see today's temperature ranked against every recorded value for that same calendar day.

**Architecture:** A build-time Node script fetches MeteoSwiss daily CSVs and condenses each station into a packed fixed-stride JSON array. The browser loads one station file plus small live files, and all statistics are computed by pure functions that take a packed station and return chart-ready points. No backend; both upstream APIs send permissive CORS headers.

**Tech Stack:** Vite, React 18, TypeScript (strict), Recharts, Vitest, Node 22.

## Global Constraints

- Node 22+ (`node -v` is v22.15.1 on this machine). TypeScript `strict: true`.
- All MeteoSwiss CSVs are `;`-delimited, **latin-1 (ISO-8859-1)** encoded, timestamps `DD.MM.YYYY HH:MM`. Never decode them as UTF-8 — it throws on `Grächen`.
- Packed arrays: `SLOTS_PER_YEAR = 366`, `MISSING = -32768`, values are °C × 10 stored as integers.
- Attribution **"Source: MeteoSwiss"** must be visible in the UI. Open-Meteo must also be credited when used.
- Live-station search radius: **15 km**.
- Trend line suppressed below **30 years** of data.
- Norm deviation suppressed below **20** of the 30 years 1991–2020.
- Build script fetch concurrency: **8**.
- Station coverage comes from `ogd-smn_meta_datainventory.csv`, **never** from `station_data_since`.
- Metric column names differ by collection: NBCN `ths200d0/dx/dn`, SMN `tre200d0/dx/dn`.

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` | Shared types: `Metric`, `PackedStation`, `StationIndexEntry`, `DayPoint`, `SourcePlan` |
| `src/lib/csv.ts` | latin-1 + `;` + `DD.MM.YYYY` parsing. Pure. |
| `src/lib/packed.ts` | Slot arithmetic and packed-array codec. Pure. |
| `src/lib/series.ts` | `dayAcrossYears`, `rank`, `trendPerCentury`, `normDeviation`. Pure. |
| `src/lib/dayAggregate.ts` | 10-minute readings → day-so-far mean/max/min. Pure. |
| `src/lib/geo.ts` | Haversine distance, nearest-station search. Pure. |
| `src/lib/resolvePlace.ts` | Station + place → `SourcePlan` with caveats. Pure. |
| `src/lib/sources/packedStation.ts` | Fetch `public/data/stations/<ABBR>.json` |
| `src/lib/sources/dailyRecent.ts` | Fetch + merge current-year `_d_recent.csv` |
| `src/lib/sources/smnLive.ts` | Fetch + parse `_t_now.csv` |
| `src/lib/sources/openMeteo.ts` | Geocode, archive, current |
| `src/components/*.tsx` | One component per file, presentational |
| `src/hooks/useStationSeries.ts` | Orchestrates the fetches for the selected station |
| `scripts/build-data.ts` | The build-time data pipeline |
| `scripts/capture-fixtures.ts` | Regenerates trimmed test fixtures from upstream |
| `tests/fixtures/*.csv` | Trimmed real CSVs (~15 KB each), committed |

---

### Task 1: Project scaffold and toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/types.ts`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run dev`; the shared types below, imported by nearly every later task.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "swiss-temp-dashboard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "build:data": "tsx scripts/build-data.ts",
    "capture:fixtures": "tsx scripts/capture-fixtures.ts"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4",
    "vite": "^5.3.5",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "scripts", "tests"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Swiss Temperature Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/types.ts`**

```ts
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
```

- [ ] **Step 6: Create `src/main.tsx` and `src/App.tsx`**

```tsx
// src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

```tsx
// src/App.tsx
export function App() {
  return <h1>Swiss Temperature Dashboard</h1>;
}
```

- [ ] **Step 7: Write a smoke test**

```ts
// src/lib/smoke.test.ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install and run**

```bash
npm install
npm test
```

Expected: 1 test passes.

- [ ] **Step 9: Verify typecheck passes**

```bash
npx tsc -b
```

Expected: no output, exit 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Vitest project"
```

---

### Task 2: CSV parsing

**Files:**
- Create: `src/lib/csv.ts`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `decodeLatin1(bytes: ArrayBuffer | Uint8Array): string`
  - `parseSemicolonCsv(text: string): { header: string[]; rows: string[][] }`
  - `parseSwissDate(s: string): { year: number; month: number; day: number }`
  - `columnIndex(header: string[], name: string): number` — throws if absent.
  - `parseNumberOrNull(s: string): number | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/csv.test.ts
import { describe, expect, it } from 'vitest';
import {
  columnIndex,
  decodeLatin1,
  parseNumberOrNull,
  parseSemicolonCsv,
  parseSwissDate,
} from './csv';

describe('decodeLatin1', () => {
  it('decodes bytes that are invalid UTF-8', () => {
    // 0xE4 is "ä" in latin-1 but an invalid UTF-8 continuation byte.
    const bytes = new Uint8Array([0x47, 0x72, 0xe4, 0x63, 0x68, 0x65, 0x6e]);
    expect(decodeLatin1(bytes)).toBe('Grächen');
  });

  it('strips a UTF-8 BOM if present', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    expect(decodeLatin1(bytes)).toBe('A');
  });
});

describe('parseSemicolonCsv', () => {
  it('splits header and rows on semicolons', () => {
    const { header, rows } = parseSemicolonCsv(
      'station_abbr;reference_timestamp;ths200d0\nBAS;30.07.2025 00:00;17.5\n',
    );
    expect(header).toEqual(['station_abbr', 'reference_timestamp', 'ths200d0']);
    expect(rows).toEqual([['BAS', '30.07.2025 00:00', '17.5']]);
  });

  it('ignores blank trailing lines and handles CRLF', () => {
    const { rows } = parseSemicolonCsv('a;b\r\n1;2\r\n\r\n');
    expect(rows).toEqual([['1', '2']]);
  });
});

describe('parseSwissDate', () => {
  it('parses DD.MM.YYYY HH:MM', () => {
    expect(parseSwissDate('30.07.2025 00:00')).toEqual({ year: 2025, month: 7, day: 30 });
  });

  it('parses a bare DD.MM.YYYY', () => {
    expect(parseSwissDate('01.01.1864')).toEqual({ year: 1864, month: 1, day: 1 });
  });

  it('throws on an unexpected shape', () => {
    expect(() => parseSwissDate('2025-07-30')).toThrow(/unrecognised date/i);
  });
});

describe('columnIndex', () => {
  it('finds a column', () => {
    expect(columnIndex(['a', 'b'], 'b')).toBe(1);
  });

  it('throws naming the missing column', () => {
    expect(() => columnIndex(['a'], 'tre200d0')).toThrow(/tre200d0/);
  });
});

describe('parseNumberOrNull', () => {
  it('parses numbers', () => {
    expect(parseNumberOrNull('17.5')).toBe(17.5);
    expect(parseNumberOrNull('-2.4')).toBe(-2.4);
  });

  it('returns null for blank or non-numeric values', () => {
    expect(parseNumberOrNull('')).toBeNull();
    expect(parseNumberOrNull('   ')).toBeNull();
    expect(parseNumberOrNull('-')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: FAIL — cannot resolve `./csv`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/csv.ts

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat: add latin-1 semicolon CSV parsing for MeteoSwiss files"
```

---

### Task 3: Packed array codec

**Files:**
- Create: `src/lib/packed.ts`
- Test: `src/lib/packed.test.ts`

**Interfaces:**
- Consumes: `PackedStation` from `src/types.ts`.
- Produces:
  - `MONTH_OFFSET: readonly number[]`, `SLOTS_PER_YEAR = 366`, `MISSING = -32768`
  - `slotOfYear(month: number, day: number): number`
  - `indexFor(fromYear: number, year: number, month: number, day: number): number`
  - `allocateSeries(fromYear: number, toYear: number): number[]`
  - `encodeValue(celsius: number | null): number`
  - `decodeValue(packed: number): number | null`
  - `metricArray(st: PackedStation, metric: Metric): number[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/packed.test.ts
import { describe, expect, it } from 'vitest';
import {
  MISSING,
  SLOTS_PER_YEAR,
  allocateSeries,
  decodeValue,
  encodeValue,
  indexFor,
  metricArray,
  slotOfYear,
} from './packed';
import type { PackedStation } from '../types';

describe('slotOfYear', () => {
  it('puts Jan 1 at slot 0 and Dec 31 at slot 365', () => {
    expect(slotOfYear(1, 1)).toBe(0);
    expect(slotOfYear(12, 31)).toBe(365);
  });

  it('reserves slot 59 for Feb 29 so Mar 1 is always slot 60', () => {
    expect(slotOfYear(2, 29)).toBe(59);
    expect(slotOfYear(3, 1)).toBe(60);
  });

  it('gives a date the same slot regardless of year (the leap-year trap)', () => {
    // A true day-of-year would shift Mar 1 by one between leap and common years.
    const leapMar1 = indexFor(2000, 2000, 3, 1) - indexFor(2000, 2000, 1, 1);
    const commonMar1 = indexFor(2000, 2001, 3, 1) - indexFor(2000, 2001, 1, 1);
    expect(leapMar1).toBe(commonMar1);
    expect(leapMar1).toBe(60);
  });

  it('places July 30 at slot 211', () => {
    // 31+29+31+30+31+30 = 182 days before July, then +29 for the 30th.
    expect(slotOfYear(7, 30)).toBe(211);
  });
});

describe('indexFor', () => {
  it('strides by 366 per year', () => {
    expect(indexFor(1864, 1864, 1, 1)).toBe(0);
    expect(indexFor(1864, 1865, 1, 1)).toBe(SLOTS_PER_YEAR);
    expect(indexFor(1864, 1866, 7, 30)).toBe(2 * SLOTS_PER_YEAR + 211);
  });
});

describe('allocateSeries', () => {
  it('allocates 366 slots per inclusive year, all MISSING', () => {
    const a = allocateSeries(2000, 2002);
    expect(a).toHaveLength(3 * SLOTS_PER_YEAR);
    expect(new Set(a)).toEqual(new Set([MISSING]));
  });
});

describe('encodeValue / decodeValue', () => {
  it('round-trips to one decimal place', () => {
    for (const v of [0, 17.5, -2.4, 34.1, -30.7]) {
      expect(decodeValue(encodeValue(v))).toBeCloseTo(v, 5);
    }
  });

  it('maps null to MISSING and back', () => {
    expect(encodeValue(null)).toBe(MISSING);
    expect(decodeValue(MISSING)).toBeNull();
  });

  it('rounds rather than truncates', () => {
    expect(encodeValue(17.55)).toBe(176);
    expect(encodeValue(-17.55)).toBe(-176);
  });
});

describe('metricArray', () => {
  const st = {
    mean: [1],
    max: [2],
    min: [3],
  } as unknown as PackedStation;

  it('selects the array for each metric', () => {
    expect(metricArray(st, 'mean')).toEqual([1]);
    expect(metricArray(st, 'max')).toEqual([2]);
    expect(metricArray(st, 'min')).toEqual([3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/packed.test.ts`
Expected: FAIL — cannot resolve `./packed`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/packed.ts
import type { Metric, PackedStation } from '../types';

/**
 * Cumulative days before each month *as if every year were a leap year*.
 *
 * Using a real day-of-year would shift every date after February by one slot in
 * common years, so Mar 1 in 2001 would collide with Feb 29's slot from 2000.
 * A fixed leap-year table keeps a calendar date on the same offset in every
 * year, which is exactly what "this day across all years" needs.
 */
export const MONTH_OFFSET = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335] as const;

export const SLOTS_PER_YEAR = 366;

/** Sentinel for "no reading". Chosen to sit outside Int16 temperature range. */
export const MISSING = -32768;

export function slotOfYear(month: number, day: number): number {
  if (month < 1 || month > 12) throw new Error(`Month out of range: ${month}`);
  if (day < 1 || day > 31) throw new Error(`Day out of range: ${day}`);
  return MONTH_OFFSET[month - 1] + (day - 1);
}

export function indexFor(fromYear: number, year: number, month: number, day: number): number {
  return (year - fromYear) * SLOTS_PER_YEAR + slotOfYear(month, day);
}

export function allocateSeries(fromYear: number, toYear: number): number[] {
  const years = toYear - fromYear + 1;
  if (years <= 0) throw new Error(`Empty year range: ${fromYear}..${toYear}`);
  return new Array<number>(years * SLOTS_PER_YEAR).fill(MISSING);
}

export function encodeValue(celsius: number | null): number {
  if (celsius === null || !Number.isFinite(celsius)) return MISSING;
  // Math.round on a negative half rounds toward +Infinity, so round magnitude.
  const scaled = Math.sign(celsius) * Math.round(Math.abs(celsius) * 10);
  return scaled;
}

export function decodeValue(packed: number): number | null {
  return packed === MISSING ? null : packed / 10;
}

export function metricArray(st: PackedStation, metric: Metric): number[] {
  switch (metric) {
    case 'mean':
      return st.mean;
    case 'max':
      return st.max;
    case 'min':
      return st.min;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/packed.test.ts`
Expected: all PASS. If `encodeValue(-17.55)` fails, check the `Math.sign` handling — `Math.round(-175.5)` is `-175`, not `-176`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/packed.ts src/lib/packed.test.ts
git commit -m "feat: add packed series codec with leap-safe slot indexing"
```

---

### Task 4: Test fixtures

**Files:**
- Create: `scripts/capture-fixtures.ts`
- Create (generated, committed): `tests/fixtures/ogd-nbcn_bas_d_trimmed.csv`, `tests/fixtures/ogd-smn_bus_d_trimmed.csv`, `tests/fixtures/ogd-smn_bas_t_now.csv`, `tests/fixtures/ogd-smn_meta_stations_sample.csv`, `tests/fixtures/ogd-smn_meta_datainventory_sample.csv`
- Test: `tests/fixtures.test.ts`

**Interfaces:**
- Consumes: `parseSemicolonCsv`, `decodeLatin1` from Task 2.
- Produces: committed fixture files, and `tests/fixtures/paths.ts` exporting `FIXTURES` — a record of absolute fixture paths used by Tasks 5–8.

Fixtures are trimmed to the rows the tests actually assert on (all 30 July, all 29 Feb, all 1 March rows) so they stay ~15 KB instead of 2.7 MB, while preserving every reference value in the spec.

- [ ] **Step 1: Write the capture script**

```ts
// scripts/capture-fixtures.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { decodeLatin1, parseSemicolonCsv } from '../src/lib/csv';

const OUT = new URL('../tests/fixtures/', import.meta.url);
const KEEP_DATES = new Set(['30.07', '29.02', '01.03']);

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return decodeLatin1(await res.arrayBuffer());
}

/** Keep the header plus rows whose DD.MM prefix is in KEEP_DATES. */
function trimByDate(text: string): string {
  const { header, rows } = parseSemicolonCsv(text);
  const kept = rows.filter((r) => KEEP_DATES.has(r[1]?.slice(0, 5) ?? ''));
  return [header.join(';'), ...kept.map((r) => r.join(';'))].join('\n') + '\n';
}

/** Keep the header plus the first `n` rows. */
function trimHead(text: string, n: number): string {
  const { header, rows } = parseSemicolonCsv(text);
  return [header.join(';'), ...rows.slice(0, n).map((r) => r.join(';'))].join('\n') + '\n';
}

const BASE = 'https://data.geo.admin.ch';

async function main() {
  await mkdir(OUT, { recursive: true });

  const nbcnBas = await fetchText(
    `${BASE}/ch.meteoschweiz.ogd-nbcn/bas/ogd-nbcn_bas_d_historical.csv`,
  );
  await writeFile(new URL('ogd-nbcn_bas_d_trimmed.csv', OUT), trimByDate(nbcnBas), 'latin1');

  const smnBus = await fetchText(
    `${BASE}/ch.meteoschweiz.ogd-smn/bus/ogd-smn_bus_d_historical.csv`,
  );
  await writeFile(new URL('ogd-smn_bus_d_trimmed.csv', OUT), trimByDate(smnBus), 'latin1');

  const live = await fetchText(`${BASE}/ch.meteoschweiz.ogd-smn/bas/ogd-smn_bas_t_now.csv`);
  await writeFile(new URL('ogd-smn_bas_t_now.csv', OUT), live, 'latin1');

  const stations = await fetchText(`${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv`);
  await writeFile(
    new URL('ogd-smn_meta_stations_sample.csv', OUT),
    trimHead(stations, 400),
    'latin1',
  );

  const inv = await fetchText(
    `${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_datainventory.csv`,
  );
  // Keep only temperature parameters, so the sample stays small but complete.
  const { header, rows } = parseSemicolonCsv(inv);
  const tempRows = rows.filter((r) => r[1]?.startsWith('tre200'));
  await writeFile(
    new URL('ogd-smn_meta_datainventory_sample.csv', OUT),
    [header.join(';'), ...tempRows.map((r) => r.join(';'))].join('\n') + '\n',
    'latin1',
  );

  console.log('fixtures written');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the capture script**

```bash
npx tsx scripts/capture-fixtures.ts
ls -la tests/fixtures/
```

Expected: five CSV files, the two `_trimmed` ones around 15 KB each.

- [ ] **Step 3: Create `tests/fixtures/paths.ts`**

```ts
// tests/fixtures/paths.ts
import { readFileSync } from 'node:fs';
import { decodeLatin1 } from '../../src/lib/csv';

const dir = new URL('./', import.meta.url);

export function fixtureText(name: string): string {
  return decodeLatin1(readFileSync(new URL(name, dir)));
}

export const FIXTURES = {
  nbcnBasDaily: 'ogd-nbcn_bas_d_trimmed.csv',
  smnBusDaily: 'ogd-smn_bus_d_trimmed.csv',
  smnBasLive: 'ogd-smn_bas_t_now.csv',
  smnStations: 'ogd-smn_meta_stations_sample.csv',
  smnInventory: 'ogd-smn_meta_datainventory_sample.csv',
} as const;
```

- [ ] **Step 4: Write a test asserting the fixtures carry the spec's reference values**

```ts
// tests/fixtures.test.ts
import { describe, expect, it } from 'vitest';
import { columnIndex, parseSemicolonCsv } from '../src/lib/csv';
import { FIXTURES, fixtureText } from './fixtures/paths';

describe('NBCN Basel fixture', () => {
  const { header, rows } = parseSemicolonCsv(fixtureText(FIXTURES.nbcnBasDaily));

  it('has the homogenised temperature columns', () => {
    expect(columnIndex(header, 'ths200d0')).toBeGreaterThanOrEqual(0);
    expect(columnIndex(header, 'ths200dx')).toBeGreaterThanOrEqual(0);
    expect(columnIndex(header, 'ths200dn')).toBeGreaterThanOrEqual(0);
  });

  it('contains 162 July 30ths, 40 Feb 29ths and 162 Mar 1sts', () => {
    const count = (ddmm: string) =>
      rows.filter((r) => r[1].startsWith(ddmm)).length;
    expect(count('30.07')).toBe(162);
    expect(count('29.02')).toBe(40);
    expect(count('01.03')).toBe(162);
  });

  it('records 26.8 °C as the mean on 30 July 1947', () => {
    const ts = columnIndex(header, 'reference_timestamp');
    const mean = columnIndex(header, 'ths200d0');
    const row = rows.find((r) => r[ts].startsWith('30.07.1947'));
    expect(row?.[mean]).toBe('26.8');
  });
});

describe('SMN Buchs/Aarau fixture', () => {
  const { header, rows } = parseSemicolonCsv(fixtureText(FIXTURES.smnBusDaily));

  it('uses tre200* column names, not ths200*', () => {
    expect(header).toContain('tre200d0');
    expect(header).not.toContain('ths200d0');
  });

  it('contains 42 July 30ths, starting in 1984', () => {
    const july = rows.filter((r) => r[1].startsWith('30.07'));
    expect(july).toHaveLength(42);
    expect(july[0][1]).toContain('1984');
  });

  it('records 34.1 °C as the max on 30 July 2018', () => {
    const ts = columnIndex(header, 'reference_timestamp');
    const max = columnIndex(header, 'tre200dx');
    const row = rows.find((r) => r[ts].startsWith('30.07.2018'));
    expect(row?.[max]).toBe('34.1');
  });
});

describe('station name decoding', () => {
  it('preserves non-ASCII station names through latin-1 decoding', () => {
    const text = fixtureText(FIXTURES.smnStations);
    expect(text).toContain('Grächen');
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/fixtures.test.ts`
Expected: all PASS. If the July-30 count differs, the upstream file has gained a year — update the spec's reference values and this test together, deliberately.

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-fixtures.ts tests/
git commit -m "test: capture trimmed MeteoSwiss fixtures with verified reference values"
```

---

### Task 5: Daily CSV reader (both collections)

**Files:**
- Create: `src/lib/dailyCsv.ts`
- Test: `src/lib/dailyCsv.test.ts`

**Interfaces:**
- Consumes: Task 2 (`csv.ts`), Task 3 (`packed.ts`), Task 4 (fixtures).
- Produces:
  - `COLUMNS: Record<'nbcn' | 'smn', Record<Metric, string>>`
  - `type DailyRow = { year: number; month: number; day: number; mean: number | null; max: number | null; min: number | null }`
  - `readDailyCsv(text: string, collection: 'nbcn' | 'smn'): DailyRow[]`
  - `packRows(rows: DailyRow[]): { fromYear: number; toYear: number; mean: number[]; max: number[]; min: number[] }`

NBCN and SMN differ only in column names, so one parameterised reader serves both.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dailyCsv.test.ts
import { describe, expect, it } from 'vitest';
import { readDailyCsv, packRows } from './dailyCsv';
import { decodeValue, indexFor } from './packed';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';

describe('readDailyCsv', () => {
  it('reads NBCN homogenised columns', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const y1947 = rows.find((r) => r.year === 1947 && r.month === 7 && r.day === 30);
    expect(y1947?.mean).toBe(26.8);
  });

  it('reads SMN measured columns', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.smnBusDaily), 'smn');
    const y2018 = rows.find((r) => r.year === 2018 && r.month === 7 && r.day === 30);
    expect(y2018?.max).toBe(34.1);
  });

  it('yields null for blank min/max in early NBCN years', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const early = rows.find((r) => r.year === 1870 && r.month === 7 && r.day === 30);
    expect(early?.mean).not.toBeNull();
    expect(early?.min).toBeNull();
    expect(early?.max).toBeNull();
  });
});

describe('packRows', () => {
  it('derives the year range from the data', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.smnBusDaily), 'smn');
    const packed = packRows(rows);
    expect(packed.fromYear).toBe(1984);
    expect(packed.toYear).toBe(2025);
  });

  it('places values at the leap-safe slot so they round-trip', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const packed = packRows(rows);
    const i = indexFor(packed.fromYear, 1947, 7, 30);
    expect(decodeValue(packed.mean[i])).toBeCloseTo(26.8, 5);
  });

  it('keeps Feb 29 and Mar 1 in separate slots', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const packed = packRows(rows);
    // 2000 was a leap year: both dates exist and must not overwrite each other.
    const feb29 = indexFor(packed.fromYear, 2000, 2, 29);
    const mar1 = indexFor(packed.fromYear, 2000, 3, 1);
    expect(feb29).not.toBe(mar1);
    expect(decodeValue(packed.mean[feb29])).not.toBeNull();
    expect(decodeValue(packed.mean[mar1])).not.toBeNull();
  });

  it('leaves Feb 29 MISSING in a common year', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const packed = packRows(rows);
    const i = indexFor(packed.fromYear, 1999, 2, 29);
    expect(decodeValue(packed.mean[i])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dailyCsv.test.ts`
Expected: FAIL — cannot resolve `./dailyCsv`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dailyCsv.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dailyCsv.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyCsv.ts src/lib/dailyCsv.test.ts
git commit -m "feat: add daily CSV reader covering both NBCN and SMN column families"
```

---

### Task 6: Series statistics

**Files:**
- Create: `src/lib/series.ts`
- Test: `src/lib/series.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 5.
- Produces:
  - `dayAcrossYears(st: PackedStation, month: number, day: number, metric: Metric): DayPoint[]`
  - `rankDescending(points: DayPoint[], value: number): number` — 1 means warmest.
  - `trendPerCentury(points: DayPoint[]): number | null` — null under 30 points.
  - `normDeviation(points: DayPoint[], value: number): number | null` — null under 20 of 1991–2020.
  - `extremes(points: DayPoint[]): { hottest: DayPoint; coldest: DayPoint } | null`
  - `MIN_YEARS_FOR_TREND = 30`, `MIN_YEARS_FOR_NORM = 20`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/series.test.ts
import { describe, expect, it } from 'vitest';
import {
  MIN_YEARS_FOR_TREND,
  dayAcrossYears,
  extremes,
  normDeviation,
  rankDescending,
  trendPerCentury,
} from './series';
import { packRows, readDailyCsv } from './dailyCsv';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';
import type { DayPoint, PackedStation } from '../types';

function station(collection: 'nbcn' | 'smn', fixture: string): PackedStation {
  const packed = packRows(readDailyCsv(fixtureText(fixture), collection));
  return {
    abbr: 'TST',
    name: 'Test',
    canton: 'ZH',
    lat: 47,
    lon: 8,
    altitude: 400,
    source: collection,
    homogenised: collection === 'nbcn',
    ...packed,
  };
}

const basel = station('nbcn', FIXTURES.nbcnBasDaily);
const aarau = station('smn', FIXTURES.smnBusDaily);

describe('dayAcrossYears', () => {
  it('returns 162 years for 30 July at Basel', () => {
    expect(dayAcrossYears(basel, 7, 30, 'mean')).toHaveLength(162);
  });

  it('returns 42 years for 30 July at Buchs/Aarau', () => {
    expect(dayAcrossYears(aarau, 7, 30, 'mean')).toHaveLength(42);
  });

  it('returns points sorted ascending by year', () => {
    const pts = dayAcrossYears(basel, 7, 30, 'mean');
    expect(pts[0].year).toBe(1864);
    expect(pts.at(-1)!.year).toBe(2025);
  });

  it('omits years whose value is missing rather than emitting zeros', () => {
    // Basel min/max only begin in 1897.
    const pts = dayAcrossYears(basel, 7, 30, 'max');
    expect(pts.length).toBeLessThan(162);
    expect(pts.every((p) => p.year >= 1897)).toBe(true);
    expect(pts.some((p) => p.value === 0)).toBe(false);
  });

  it('returns only the leap years for Feb 29', () => {
    expect(dayAcrossYears(basel, 2, 29, 'mean')).toHaveLength(40);
  });
});

describe('rankDescending', () => {
  const pts: DayPoint[] = [
    { year: 1, value: 10 },
    { year: 2, value: 30 },
    { year: 3, value: 20 },
  ];

  it('ranks the warmest as 1', () => {
    expect(rankDescending(pts, 30)).toBe(1);
    expect(rankDescending(pts, 20)).toBe(2);
    expect(rankDescending(pts, 10)).toBe(3);
  });

  it('ranks a new record above every stored value', () => {
    expect(rankDescending(pts, 99)).toBe(1);
  });

  it('reports 1947 as the warmest 30 July at Basel', () => {
    const july = dayAcrossYears(basel, 7, 30, 'mean');
    const hottest = extremes(july)!.hottest;
    expect(hottest.year).toBe(1947);
    expect(hottest.value).toBeCloseTo(26.8, 5);
    expect(rankDescending(july, hottest.value)).toBe(1);
  });
});

describe('trendPerCentury', () => {
  it('computes +2.57 °C/century for 30 July at Basel', () => {
    const pts = dayAcrossYears(basel, 7, 30, 'mean');
    expect(trendPerCentury(pts)).toBeCloseTo(2.5725, 3);
  });

  it('recovers an exact synthetic slope', () => {
    // +1 °C per year == +100 °C per century.
    const pts: DayPoint[] = Array.from({ length: 40 }, (_, i) => ({
      year: 2000 + i,
      value: i,
    }));
    expect(trendPerCentury(pts)).toBeCloseTo(100, 6);
  });

  it('returns null below the 30-year floor', () => {
    const pts: DayPoint[] = Array.from({ length: MIN_YEARS_FOR_TREND - 1 }, (_, i) => ({
      year: 2000 + i,
      value: i,
    }));
    expect(trendPerCentury(pts)).toBeNull();
  });
});

describe('normDeviation', () => {
  it('measures against the 1991-2020 mean for 30 July at Basel (21.07 °C)', () => {
    const pts = dayAcrossYears(basel, 7, 30, 'mean');
    expect(normDeviation(pts, 21.0667)).toBeCloseTo(0, 3);
    expect(normDeviation(pts, 24.0667)).toBeCloseTo(3, 3);
  });

  it('returns null when fewer than 20 norm years are present', () => {
    const pts: DayPoint[] = [
      { year: 1995, value: 20 },
      { year: 1996, value: 20 },
    ];
    expect(normDeviation(pts, 25)).toBeNull();
  });
});

describe('extremes', () => {
  it('returns null for an empty series', () => {
    expect(extremes([])).toBeNull();
  });

  it('finds hottest and coldest', () => {
    const pts: DayPoint[] = [
      { year: 1, value: 10 },
      { year: 2, value: 30 },
    ];
    expect(extremes(pts)).toEqual({
      hottest: { year: 2, value: 30 },
      coldest: { year: 1, value: 10 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/series.test.ts`
Expected: FAIL — cannot resolve `./series`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/series.ts
import type { DayPoint, Metric, PackedStation } from '../types';
import { SLOTS_PER_YEAR, decodeValue, metricArray, slotOfYear } from './packed';

export const MIN_YEARS_FOR_TREND = 30;
export const MIN_YEARS_FOR_NORM = 20;
const NORM_FROM = 1991;
const NORM_TO = 2020;

/**
 * Every value recorded on one calendar day, one point per year.
 * Because slots are fixed-stride, this is a walk with step 366 rather than a scan.
 */
export function dayAcrossYears(
  st: PackedStation,
  month: number,
  day: number,
  metric: Metric,
): DayPoint[] {
  const arr = metricArray(st, metric);
  const slot = slotOfYear(month, day);
  const out: DayPoint[] = [];
  for (let year = st.fromYear; year <= st.toYear; year++) {
    const i = (year - st.fromYear) * SLOTS_PER_YEAR + slot;
    const v = decodeValue(arr[i]);
    if (v !== null) out.push({ year, value: v });
  }
  return out;
}

/** 1 means warmest. A value above every point also ranks 1. */
export function rankDescending(points: DayPoint[], value: number): number {
  let warmer = 0;
  for (const p of points) if (p.value > value) warmer++;
  return warmer + 1;
}

/**
 * Least-squares slope, expressed per century so the number is legible.
 * Returns null below MIN_YEARS_FOR_TREND: a slope fitted to a handful of noisy
 * single days is not meaningful.
 */
export function trendPerCentury(points: DayPoint[]): number | null {
  const n = points.length;
  if (n < MIN_YEARS_FOR_TREND) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sx += p.year;
    sy += p.value;
    sxy += p.year * p.value;
    sxx += p.year * p.year;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slopePerYear = (n * sxy - sx * sy) / denom;
  return slopePerYear * 100;
}

/**
 * Difference between `value` and this day's 1991-2020 average.
 * Used for SMN stations, which have no precomputed th9120dv column.
 */
export function normDeviation(points: DayPoint[], value: number): number | null {
  const norm = points.filter((p) => p.year >= NORM_FROM && p.year <= NORM_TO);
  if (norm.length < MIN_YEARS_FOR_NORM) return null;
  const mean = norm.reduce((a, p) => a + p.value, 0) / norm.length;
  return value - mean;
}

export function extremes(
  points: DayPoint[],
): { hottest: DayPoint; coldest: DayPoint } | null {
  if (points.length === 0) return null;
  let hottest = points[0];
  let coldest = points[0];
  for (const p of points) {
    if (p.value > hottest.value) hottest = p;
    if (p.value < coldest.value) coldest = p;
  }
  return { hottest, coldest };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/series.test.ts`
Expected: all PASS. The `2.5725` assertion is the real slope for Basel's 30 July mean series; if it fails, `trendPerCentury` is not multiplying by 100 or is fitting against an index rather than the year.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series.ts src/lib/series.test.ts
git commit -m "feat: add day-across-years statistics with trend and norm floors"
```

---

### Task 7: Day-so-far aggregation from 10-minute readings

**Files:**
- Create: `src/lib/dayAggregate.ts`
- Test: `src/lib/dayAggregate.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `type Reading = { year: number; month: number; day: number; hour: number; minute: number; celsius: number }`
  - `parseLiveCsv(text: string): Reading[]`
  - `type DaySoFar = { mean: number; max: number; min: number; latest: Reading; count: number }`
  - `daySoFar(readings: Reading[]): DaySoFar | null`
  - `isStale(latest: Reading, now: Date, maxAgeMinutes?: number): boolean` — default 120.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dayAggregate.test.ts
import { describe, expect, it } from 'vitest';
import { daySoFar, isStale, parseLiveCsv, type Reading } from './dayAggregate';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';

describe('parseLiveCsv', () => {
  const readings = parseLiveCsv(fixtureText(FIXTURES.smnBasLive));

  it('reads tre200s0 into readings', () => {
    expect(readings.length).toBeGreaterThan(0);
    expect(typeof readings[0].celsius).toBe('number');
  });

  it('parses the timestamp into date and time parts', () => {
    const r = readings[0];
    expect(r.month).toBeGreaterThanOrEqual(1);
    expect(r.minute % 10).toBe(0);
  });

  it('skips rows with a blank temperature', () => {
    const text = [
      'station_abbr;reference_timestamp;tre200s0',
      'BAS;30.07.2026 00:00;23.4',
      'BAS;30.07.2026 00:10;',
      'BAS;30.07.2026 00:20;21.0',
    ].join('\n');
    expect(parseLiveCsv(text)).toHaveLength(2);
  });
});

describe('daySoFar', () => {
  const mk = (minute: number, celsius: number): Reading => ({
    year: 2026,
    month: 7,
    day: 30,
    hour: 0,
    minute,
    celsius,
  });

  it('returns null for no readings', () => {
    expect(daySoFar([])).toBeNull();
  });

  it('computes mean, max, min and count over a partial day', () => {
    const got = daySoFar([mk(0, 10), mk(10, 20), mk(20, 30)])!;
    expect(got.mean).toBeCloseTo(20, 6);
    expect(got.max).toBe(30);
    expect(got.min).toBe(10);
    expect(got.count).toBe(3);
  });

  it('reports the chronologically latest reading, not the last row', () => {
    const got = daySoFar([mk(20, 30), mk(0, 10), mk(10, 20)])!;
    expect(got.latest.minute).toBe(20);
    expect(got.latest.celsius).toBe(30);
  });

  it('handles a single reading', () => {
    const got = daySoFar([mk(0, 15)])!;
    expect(got.mean).toBe(15);
    expect(got.max).toBe(15);
    expect(got.min).toBe(15);
  });
});

describe('isStale', () => {
  const r: Reading = { year: 2026, month: 7, day: 30, hour: 12, minute: 0, celsius: 20 };

  it('accepts a fresh reading', () => {
    expect(isStale(r, new Date('2026-07-30T12:30:00'))).toBe(false);
  });

  it('rejects a reading older than two hours', () => {
    expect(isStale(r, new Date('2026-07-30T15:00:00'))).toBe(true);
  });

  it('honours a custom age limit', () => {
    expect(isStale(r, new Date('2026-07-30T12:30:00'), 20)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dayAggregate.test.ts`
Expected: FAIL — cannot resolve `./dayAggregate`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dayAggregate.ts
import { columnIndex, parseNumberOrNull, parseSemicolonCsv, parseSwissDate } from './csv';

export interface Reading {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  celsius: number;
}

export interface DaySoFar {
  mean: number;
  max: number;
  min: number;
  latest: Reading;
  count: number;
}

const TIME = /\s(\d{2}):(\d{2})$/;

export function parseLiveCsv(text: string): Reading[] {
  const { header, rows } = parseSemicolonCsv(text);
  const ts = columnIndex(header, 'reference_timestamp');
  const iTemp = columnIndex(header, 'tre200s0');

  const out: Reading[] = [];
  for (const r of rows) {
    const celsius = parseNumberOrNull(r[iTemp]);
    if (celsius === null) continue;
    const { year, month, day } = parseSwissDate(r[ts]);
    const t = TIME.exec(r[ts]);
    out.push({
      year,
      month,
      day,
      hour: t ? Number(t[1]) : 0,
      minute: t ? Number(t[2]) : 0,
      celsius,
    });
  }
  return out;
}

const minutesOfDay = (r: Reading) => r.hour * 60 + r.minute;

/**
 * Aggregate the day's readings so far. The result is provisional until midnight:
 * `max` is a running maximum and `mean` covers only the elapsed part of the day.
 * Callers must label it as in progress rather than compare it to a finished day.
 */
export function daySoFar(readings: Reading[]): DaySoFar | null {
  if (readings.length === 0) return null;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  let latest = readings[0];
  for (const r of readings) {
    sum += r.celsius;
    if (r.celsius > max) max = r.celsius;
    if (r.celsius < min) min = r.celsius;
    if (minutesOfDay(r) > minutesOfDay(latest)) latest = r;
  }
  return { mean: sum / readings.length, max, min, latest, count: readings.length };
}

export function isStale(latest: Reading, now: Date, maxAgeMinutes = 120): boolean {
  const at = new Date(
    latest.year,
    latest.month - 1,
    latest.day,
    latest.hour,
    latest.minute,
  );
  const ageMinutes = (now.getTime() - at.getTime()) / 60000;
  return ageMinutes > maxAgeMinutes;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dayAggregate.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dayAggregate.ts src/lib/dayAggregate.test.ts
git commit -m "feat: aggregate 10-minute readings into a provisional day-so-far"
```

---

### Task 8: Geo distance and place resolution

**Files:**
- Create: `src/lib/geo.ts`, `src/lib/resolvePlace.ts`
- Test: `src/lib/geo.test.ts`, `src/lib/resolvePlace.test.ts`

**Interfaces:**
- Consumes: `StationIndexEntry`, `SourcePlan` from `src/types.ts`.
- Produces:
  - `haversineKm(a: LatLon, b: LatLon): number` where `LatLon = { lat: number; lon: number }`
  - `nearestStation(stations: StationIndexEntry[], to: LatLon): { station: StationIndexEntry; km: number } | null`
  - `LIVE_RADIUS_KM = 15`
  - `resolveStation(station: StationIndexEntry, all: StationIndexEntry[]): SourcePlan`
  - `resolveGeocoded(place: { name: string; lat: number; lon: number }, all: StationIndexEntry[]): SourcePlan`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/geo.test.ts
import { describe, expect, it } from 'vitest';
import { haversineKm, nearestStation } from './geo';
import type { StationIndexEntry } from '../types';

const entry = (abbr: string, lat: number, lon: number): StationIndexEntry => ({
  abbr,
  name: abbr,
  canton: 'ZH',
  lat,
  lon,
  altitude: 400,
  source: 'smn',
  homogenised: false,
  fromYear: 1990,
  toYear: 2025,
});

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 47, lon: 8 }, { lat: 47, lon: 8 })).toBeCloseTo(0, 6);
  });

  it('measures Aarau to Buchs/Aarau at about 2.8 km', () => {
    // Aarau 47.39254, 8.04422 (geocoder); BUS station 47.384381, 8.07955 (metadata).
    const km = haversineKm(
      { lat: 47.39254, lon: 8.04422 },
      { lat: 47.384381, lon: 8.07955 },
    );
    expect(km).toBeCloseTo(2.81, 1);
  });

  it('measures Zurich to Bern at roughly 95 km', () => {
    const km = haversineKm({ lat: 47.3769, lon: 8.5417 }, { lat: 46.948, lon: 7.4474 });
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(102);
  });
});

describe('nearestStation', () => {
  it('returns null for an empty list', () => {
    expect(nearestStation([], { lat: 47, lon: 8 })).toBeNull();
  });

  it('picks the closest station and reports the distance', () => {
    const got = nearestStation(
      [entry('FAR', 46, 7), entry('NEAR', 47.01, 8.01)],
      { lat: 47, lon: 8 },
    )!;
    expect(got.station.abbr).toBe('NEAR');
    expect(got.km).toBeLessThan(2);
  });
});
```

```ts
// src/lib/resolvePlace.test.ts
import { describe, expect, it } from 'vitest';
import { resolveGeocoded, resolveStation } from './resolvePlace';
import type { StationIndexEntry } from '../types';

const bas: StationIndexEntry = {
  abbr: 'BAS',
  name: 'Basel / Binningen',
  canton: 'BL',
  lat: 47.541142,
  lon: 7.583525,
  altitude: 316,
  source: 'nbcn',
  homogenised: true,
  fromYear: 1864,
  toYear: 2025,
};

const bus: StationIndexEntry = {
  abbr: 'BUS',
  name: 'Buchs / Aarau',
  canton: 'AG',
  lat: 47.384381,
  lon: 8.07955,
  altitude: 387,
  source: 'smn',
  homogenised: false,
  fromYear: 1984,
  toYear: 2025,
};

const all = [bas, bus];

describe('resolveStation', () => {
  it('uses a homogenised station for both slots without a caveat about homogenisation', () => {
    const plan = resolveStation(bas, all);
    expect(plan.historyStation?.abbr).toBe('BAS');
    expect(plan.liveStation?.abbr).toBe('BAS');
    expect(plan.liveDistanceKm).toBeCloseTo(0, 3);
    expect(plan.caveats.join(' ')).not.toMatch(/not homogenised/i);
  });

  it('warns that a raw SMN series is not homogenised', () => {
    const plan = resolveStation(bus, all);
    expect(plan.caveats.join(' ')).toMatch(/not homogenised/i);
  });

  it('labels the plan with the station name', () => {
    expect(resolveStation(bus, all).label).toBe('Buchs / Aarau');
  });
});

describe('resolveGeocoded', () => {
  it('attaches the nearest station within 15 km and discloses the distance', () => {
    const plan = resolveGeocoded({ name: 'Aarau', lat: 47.39254, lon: 8.04422 }, all);
    expect(plan.label).toBe('Aarau');
    expect(plan.historyStation?.abbr).toBe('BUS');
    expect(plan.liveStation?.abbr).toBe('BUS');
    expect(plan.liveDistanceKm).toBeCloseTo(2.8, 1);
    expect(plan.caveats.join(' ')).toMatch(/Buchs \/ Aarau/);
    expect(plan.caveats.join(' ')).toMatch(/km/);
  });

  it('falls back to no station when nothing is within 15 km', () => {
    // Zermatt is far from both fixtures.
    const plan = resolveGeocoded({ name: 'Zermatt', lat: 46.0207, lon: 7.7491 }, all);
    expect(plan.historyStation).toBeNull();
    expect(plan.liveStation).toBeNull();
    expect(plan.caveats.join(' ')).toMatch(/Open-Meteo/);
    expect(plan.caveats.join(' ')).toMatch(/1940/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/geo.test.ts src/lib/resolvePlace.test.ts`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Write `src/lib/geo.ts`**

```ts
// src/lib/geo.ts
import type { StationIndexEntry } from '../types';

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestStation(
  stations: StationIndexEntry[],
  to: LatLon,
): { station: StationIndexEntry; km: number } | null {
  let best: { station: StationIndexEntry; km: number } | null = null;
  for (const s of stations) {
    const km = haversineKm(to, s);
    if (best === null || km < best.km) best = { station: s, km };
  }
  return best;
}
```

- [ ] **Step 4: Write `src/lib/resolvePlace.ts`**

```ts
// src/lib/resolvePlace.ts
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
export function resolveStation(
  station: StationIndexEntry,
  _all: StationIndexEntry[],
): SourcePlan {
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/geo.test.ts src/lib/resolvePlace.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geo.ts src/lib/resolvePlace.ts src/lib/geo.test.ts src/lib/resolvePlace.test.ts
git commit -m "feat: resolve places to history and live source slots with caveats"
```

---

### Task 9: Build-data script

**Files:**
- Create: `scripts/build-data.ts`, `scripts/lib/stationSet.ts`
- Test: `scripts/lib/stationSet.test.ts`
- Modify: `.gitignore` (add `.cache/`)

**Interfaces:**
- Consumes: Tasks 2, 3, 5.
- Produces:
  - `stationSet.ts`: `NBCN_ABBRS: Set<string>`, `parseStationMeta(text): Map<string, StationMeta>`, `parseInventoryCoverage(text): Map<string, number>`, `selectStations(meta, coverage): BuildTarget[]`
  - `public/data/stations.json` and `public/data/stations/<ABBR>.json` on disk.

- [ ] **Step 1: Write the failing test for station selection**

```ts
// scripts/lib/stationSet.test.ts
import { describe, expect, it } from 'vitest';
import {
  NBCN_ABBRS,
  parseInventoryCoverage,
  parseStationMeta,
  selectStations,
} from './stationSet';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';

describe('NBCN_ABBRS', () => {
  it('lists the 29 homogenised stations', () => {
    expect(NBCN_ABBRS.size).toBe(29);
    expect(NBCN_ABBRS.has('BAS')).toBe(true);
    expect(NBCN_ABBRS.has('BUS')).toBe(false);
  });
});

describe('parseStationMeta', () => {
  const meta = parseStationMeta(fixtureText(FIXTURES.smnStations));

  it('reads coordinates, altitude and canton', () => {
    const bas = meta.get('BAS')!;
    expect(bas.name).toBe('Basel / Binningen');
    expect(bas.canton).toBe('BL');
    expect(bas.lat).toBeCloseTo(47.541142, 4);
    expect(bas.altitude).toBeCloseTo(316, 1);
  });

  it('decodes non-ASCII names', () => {
    expect(meta.get('GRC')!.name).toBe('Grächen');
  });
});

describe('parseInventoryCoverage', () => {
  const cov = parseInventoryCoverage(fixtureText(FIXTURES.smnInventory));

  it('uses the daily-mean parameter start year, not the station founding year', () => {
    // The station index claims BUS has data since 1959; tre200d0 starts 1984.
    expect(cov.get('BUS')).toBe(1984);
  });

  it('reports 1864 for Basel', () => {
    expect(cov.get('BAS')).toBe(1864);
  });

  it('omits stations whose series has ended', () => {
    const text = [
      'station_abbr;parameter_shortname;meas_cat_nr;data_since;data_till;owner',
      'AAA;tre200d0;1;01.01.1990 00:00;31.12.2000 00:00;MeteoSchweiz',
      'BBB;tre200d0;1;01.01.1990 00:00;;MeteoSchweiz',
    ].join('\n');
    const c = parseInventoryCoverage(text);
    expect(c.has('AAA')).toBe(false);
    expect(c.get('BBB')).toBe(1990);
  });
});

describe('selectStations', () => {
  it('routes NBCN members to the nbcn collection and the rest to smn', () => {
    const meta = parseStationMeta(fixtureText(FIXTURES.smnStations));
    const cov = parseInventoryCoverage(fixtureText(FIXTURES.smnInventory));
    const targets = selectStations(meta, cov);

    const bas = targets.find((t) => t.abbr === 'BAS')!;
    const bus = targets.find((t) => t.abbr === 'BUS')!;
    expect(bas.collection).toBe('nbcn');
    expect(bas.homogenised).toBe(true);
    expect(bus.collection).toBe('smn');
    expect(bus.homogenised).toBe(false);
  });

  it('skips stations with no daily-temperature coverage', () => {
    const meta = new Map([
      ['ZZZ', { abbr: 'ZZZ', name: 'Nowhere', canton: 'ZH', lat: 47, lon: 8, altitude: 400 }],
    ]);
    expect(selectStations(meta, new Map())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/stationSet.test.ts`
Expected: FAIL — cannot resolve `./stationSet`.

- [ ] **Step 3: Write `scripts/lib/stationSet.ts`**

```ts
// scripts/lib/stationSet.ts
import { columnIndex, parseNumberOrNull, parseSemicolonCsv, parseSwissDate } from '../../src/lib/csv';
import type { Collection } from '../../src/lib/dailyCsv';

/** The 29 stations with homogenised series, from ogd-nbcn_meta_stations.csv. */
export const NBCN_ABBRS = new Set(
  (
    'ALT ANT BAS BER CDF CHD CHM DAV ELM ENG GRC GRH GSB GVE JUN LUG LUZ MER NEU ' +
    'OTL PAY RAG SAE SAM SBE SIA SIO SMA STG'
  ).split(' '),
);

export interface StationMeta {
  abbr: string;
  name: string;
  canton: string;
  lat: number;
  lon: number;
  altitude: number;
}

export interface BuildTarget extends StationMeta {
  collection: Collection;
  homogenised: boolean;
  coverageFromYear: number;
}

export function parseStationMeta(text: string): Map<string, StationMeta> {
  const { header, rows } = parseSemicolonCsv(text);
  const i = {
    abbr: columnIndex(header, 'station_abbr'),
    name: columnIndex(header, 'station_name'),
    canton: columnIndex(header, 'station_canton'),
    lat: columnIndex(header, 'station_coordinates_wgs84_lat'),
    lon: columnIndex(header, 'station_coordinates_wgs84_lon'),
    alt: columnIndex(header, 'station_height_masl'),
  };
  const out = new Map<string, StationMeta>();
  for (const r of rows) {
    const lat = parseNumberOrNull(r[i.lat]);
    const lon = parseNumberOrNull(r[i.lon]);
    const altitude = parseNumberOrNull(r[i.alt]);
    if (lat === null || lon === null || altitude === null) continue;
    out.set(r[i.abbr], {
      abbr: r[i.abbr],
      name: r[i.name],
      canton: r[i.canton],
      lat,
      lon,
      altitude,
    });
  }
  return out;
}

/**
 * First year of daily-mean temperature per station, for stations still reporting.
 *
 * This is the authoritative coverage. `station_data_since` in the station index
 * is when the station was founded and can be decades earlier — Buchs / Aarau
 * reports 1959 there but its temperature series begins in 1984.
 */
export function parseInventoryCoverage(text: string): Map<string, number> {
  const { header, rows } = parseSemicolonCsv(text);
  const iAbbr = columnIndex(header, 'station_abbr');
  const iParam = columnIndex(header, 'parameter_shortname');
  const iSince = columnIndex(header, 'data_since');
  const iTill = columnIndex(header, 'data_till');

  const out = new Map<string, number>();
  for (const r of rows) {
    if (r[iParam] !== 'tre200d0') continue;
    if ((r[iTill] ?? '').trim() !== '') continue; // series has ended
    const year = parseSwissDate(r[iSince]).year;
    const prev = out.get(r[iAbbr]);
    if (prev === undefined || year < prev) out.set(r[iAbbr], year);
  }
  return out;
}

export function selectStations(
  meta: Map<string, StationMeta>,
  coverage: Map<string, number>,
): BuildTarget[] {
  const out: BuildTarget[] = [];
  for (const [abbr, m] of meta) {
    const coverageFromYear = coverage.get(abbr);
    if (coverageFromYear === undefined) continue;
    const homogenised = NBCN_ABBRS.has(abbr);
    out.push({
      ...m,
      collection: homogenised ? 'nbcn' : 'smn',
      homogenised,
      coverageFromYear,
    });
  }
  out.sort((a, b) => a.abbr.localeCompare(b.abbr));
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/lib/stationSet.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write `scripts/build-data.ts`**

```ts
// scripts/build-data.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeLatin1 } from '../src/lib/csv';
import { packRows, readDailyCsv, type Collection } from '../src/lib/dailyCsv';
import type { PackedStation, StationIndexEntry } from '../src/types';
import {
  parseInventoryCoverage,
  parseStationMeta,
  selectStations,
  type BuildTarget,
} from './lib/stationSet';

const BASE = 'https://data.geo.admin.ch';
const CONCURRENCY = 8;
const CACHE = new URL('../.cache/', import.meta.url);
const OUT = new URL('../public/data/', import.meta.url);
const FORCE = process.argv.includes('--force');

/** Fetch with an on-disk cache so repeated builds don't hammer a public API. */
async function fetchCached(url: string): Promise<string> {
  const key = createHash('sha1').update(url).digest('hex');
  const path = new URL(key, CACHE);
  if (!FORCE && existsSync(path)) return decodeLatin1(await readFile(path));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  return decodeLatin1(buf);
}

function historicalUrl(t: BuildTarget): string {
  const lower = t.abbr.toLowerCase();
  return t.collection === 'nbcn'
    ? `${BASE}/ch.meteoschweiz.ogd-nbcn/${lower}/ogd-nbcn_${lower}_d_historical.csv`
    : `${BASE}/ch.meteoschweiz.ogd-smn/${lower}/ogd-smn_${lower}_d_historical.csv`;
}

async function buildOne(t: BuildTarget): Promise<StationIndexEntry> {
  const text = await fetchCached(historicalUrl(t));
  const rows = readDailyCsv(text, t.collection as Collection);
  if (rows.length === 0) throw new Error(`no rows for ${t.abbr}`);
  const packed = packRows(rows);

  const station: PackedStation = {
    abbr: t.abbr,
    name: t.name,
    canton: t.canton,
    lat: t.lat,
    lon: t.lon,
    altitude: t.altitude,
    source: t.collection,
    homogenised: t.homogenised,
    ...packed,
  };

  await writeFile(
    new URL(`stations/${t.abbr}.json`, OUT),
    JSON.stringify(station),
    'utf8',
  );

  return {
    abbr: station.abbr,
    name: station.name,
    canton: station.canton,
    lat: station.lat,
    lon: station.lon,
    altitude: station.altitude,
    source: station.source,
    homogenised: station.homogenised,
    fromYear: station.fromYear,
    toYear: station.toYear,
  };
}

/** Run tasks with a bounded number in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ item: T; result: R } | { item: T; error: Error }>> {
  const out: Array<{ item: T; result: R } | { item: T; error: Error }> = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      try {
        out[i] = { item, result: await fn(item) };
      } catch (e) {
        out[i] = { item, error: e as Error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(new URL('stations/', OUT), { recursive: true });

  console.log('fetching metadata…');
  const [metaText, invText] = await Promise.all([
    fetchCached(`${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv`),
    fetchCached(`${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_datainventory.csv`),
  ]);

  const targets = selectStations(parseStationMeta(metaText), parseInventoryCoverage(invText));
  console.log(`${targets.length} stations with daily temperature`);

  const results = await mapLimit(targets, CONCURRENCY, async (t) => {
    const entry = await buildOne(t);
    console.log(`  ${t.abbr.padEnd(4)} ${t.collection} ${entry.fromYear}-${entry.toYear}`);
    return entry;
  });

  const index: StationIndexEntry[] = [];
  const failures: string[] = [];
  for (const r of results) {
    if ('result' in r) index.push(r.result);
    else failures.push(`${r.item.abbr}: ${r.error.message}`);
  }

  await writeFile(new URL('stations.json', OUT), JSON.stringify(index), 'utf8');

  console.log(`\nwrote ${index.length} stations`);
  if (failures.length > 0) {
    console.warn(`skipped ${failures.length}:`);
    for (const f of failures) console.warn(`  ${f}`);
  }
  // A handful of upstream gaps is normal; a broad failure is a real problem.
  if (failures.length > targets.length * 0.1) {
    console.error('more than 10% of stations failed');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Add `.cache/` to `.gitignore`**

```bash
printf '.cache/\n' >> .gitignore
```

- [ ] **Step 7: Run the build**

```bash
npm run build:data
```

Expected: `149 stations with daily temperature`, then one line per station, then `wrote 149 stations`. First run takes a few minutes (~340 MB); subsequent runs are instant from `.cache/`.

- [ ] **Step 8: Verify the output**

```bash
ls public/data/stations/ | wc -l
python3 -c "
import json
idx=json.load(open('public/data/stations.json'))
print('index entries:', len(idx))
print('homogenised:', sum(1 for s in idx if s['homogenised']))
bus=[s for s in idx if s['abbr']=='BUS'][0]
print('BUS:', bus['fromYear'], '->', bus['toYear'], bus['source'])
st=json.load(open('public/data/stations/BUS.json'))
print('BUS array length:', len(st['mean']), '= years*366:', (st['toYear']-st['fromYear']+1)*366)
"
```

Expected: 149 files; 29 homogenised; `BUS: 1984 -> 2025 smn`; array length equals `years × 366`.

- [ ] **Step 9: Commit**

```bash
git add scripts/ .gitignore
git commit -m "feat: add build script producing packed station data for 149 stations"
```

---

### Task 10: Runtime data sources

**Files:**
- Create: `src/lib/sources/stationIndex.ts`, `src/lib/sources/packedStation.ts`, `src/lib/sources/dailyRecent.ts`, `src/lib/sources/smnLive.ts`, `src/lib/sources/openMeteo.ts`
- Test: `src/lib/sources/sources.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 5, 7.
- Produces:
  - `loadStationIndex(): Promise<StationIndexEntry[]>`
  - `loadPackedStation(abbr: string): Promise<PackedStation>`
  - `mergeRecent(st: PackedStation): Promise<PackedStation>`
  - `loadLive(abbr: string): Promise<Reading[]>`
  - `geocode(name: string): Promise<GeocodeResult[]>` where `GeocodeResult = { name: string; lat: number; lon: number; altitude: number; admin1: string }`
  - `openMeteoDaily(lat, lon, month, day): Promise<Record<Metric, DayPoint[]>>`
  - `openMeteoCurrent(lat, lon): Promise<number>`

All fetch functions take an injectable `fetchImpl` defaulting to `globalThis.fetch`, so tests stub it without network.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sources/sources.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadPackedStation, mergeRecent } from './packedStation';
import { loadLive } from './smnLive';
import { geocode } from './openMeteo';
import { decodeValue, indexFor } from '../packed';
import type { PackedStation } from '../../types';
import { FIXTURES, fixtureText } from '../../../tests/fixtures/paths';

const station = (): PackedStation => ({
  abbr: 'BUS',
  name: 'Buchs / Aarau',
  canton: 'AG',
  lat: 47.384381,
  lon: 8.07955,
  altitude: 387,
  source: 'smn',
  homogenised: false,
  fromYear: 2024,
  toYear: 2025,
  mean: new Array(2 * 366).fill(-32768),
  max: new Array(2 * 366).fill(-32768),
  min: new Array(2 * 366).fill(-32768),
});

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const textResponse = (text: string) =>
  ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  }) as Response;

describe('loadPackedStation', () => {
  it('fetches the station file by abbreviation', async () => {
    const st = station();
    const f = vi.fn().mockResolvedValue(jsonResponse(st));
    const got = await loadPackedStation('BUS', f);
    expect(f.mock.calls[0][0]).toContain('/data/stations/BUS.json');
    expect(got.abbr).toBe('BUS');
  });

  it('throws a useful message on 404', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(loadPackedStation('XXX', f)).rejects.toThrow(/XXX/);
  });
});

describe('mergeRecent', () => {
  it('extends toYear and writes current-year values into the packed arrays', async () => {
    const csv = [
      'station_abbr;reference_timestamp;tre200d0;tre200dx;tre200dn',
      'BUS;30.07.2026 00:00;24;33.5;14.4',
    ].join('\n');
    const f = vi.fn().mockResolvedValue(textResponse(csv));
    const merged = await mergeRecent(station(), f);

    expect(merged.toYear).toBe(2026);
    const i = indexFor(merged.fromYear, 2026, 7, 30);
    expect(decodeValue(merged.mean[i])).toBeCloseTo(24, 5);
    expect(decodeValue(merged.max[i])).toBeCloseTo(33.5, 5);
  });

  it('returns the station unchanged when the recent file is unavailable', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    const merged = await mergeRecent(station(), f);
    expect(merged.toYear).toBe(2025);
  });

  it('uses the nbcn column names for a homogenised station', async () => {
    const csv = [
      'station_abbr;reference_timestamp;ths200d0;ths200dx;ths200dn',
      'BAS;30.07.2026 00:00;24;33.5;14.4',
    ].join('\n');
    const f = vi.fn().mockResolvedValue(textResponse(csv));
    const st = { ...station(), abbr: 'BAS', source: 'nbcn' as const, homogenised: true };
    const merged = await mergeRecent(st, f);
    expect(f.mock.calls[0][0]).toContain('ogd-nbcn');
    expect(merged.toYear).toBe(2026);
  });
});

describe('loadLive', () => {
  it('parses the now file into readings', async () => {
    const f = vi.fn().mockResolvedValue(textResponse(fixtureText(FIXTURES.smnBasLive)));
    const readings = await loadLive('BAS', f);
    expect(readings.length).toBeGreaterThan(0);
    expect(f.mock.calls[0][0]).toContain('ogd-smn_bas_t_now.csv');
  });

  it('returns an empty array when the file is missing', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    expect(await loadLive('XXX', f)).toEqual([]);
  });
});

describe('geocode', () => {
  it('restricts results to Switzerland and maps the fields', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            name: 'Aarau',
            latitude: 47.39254,
            longitude: 8.04422,
            elevation: 389,
            admin1: 'Canton of Aargau',
            country_code: 'CH',
          },
        ],
      }),
    );
    const got = await geocode('Aarau', f);
    expect(f.mock.calls[0][0]).toContain('countryCode=CH');
    expect(got[0]).toEqual({
      name: 'Aarau',
      lat: 47.39254,
      lon: 8.04422,
      altitude: 389,
      admin1: 'Canton of Aargau',
    });
  });

  it('returns an empty array when the API reports no results', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({}));
    expect(await geocode('nowhere', f)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sources/sources.test.ts`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Write `src/lib/sources/stationIndex.ts` and `packedStation.ts`**

```ts
// src/lib/sources/stationIndex.ts
import type { StationIndexEntry } from '../../types';

export type FetchLike = typeof globalThis.fetch;

export async function loadStationIndex(
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<StationIndexEntry[]> {
  const res = await fetchImpl('data/stations.json');
  if (!res.ok) throw new Error(`Cannot load station index (${res.status})`);
  return (await res.json()) as StationIndexEntry[];
}
```

```ts
// src/lib/sources/packedStation.ts
import type { PackedStation } from '../../types';
import { decodeLatin1 } from '../csv';
import { packRows, readDailyCsv } from '../dailyCsv';
import { SLOTS_PER_YEAR, allocateSeries, encodeValue, indexFor } from '../packed';
import type { FetchLike } from './stationIndex';

const BASE = 'https://data.geo.admin.ch';

export async function loadPackedStation(
  abbr: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<PackedStation> {
  const res = await fetchImpl(`data/stations/${abbr}.json`);
  if (!res.ok) throw new Error(`Cannot load station ${abbr} (${res.status})`);
  return (await res.json()) as PackedStation;
}

function recentUrl(st: PackedStation): string {
  const lower = st.abbr.toLowerCase();
  return st.source === 'nbcn'
    ? `${BASE}/ch.meteoschweiz.ogd-nbcn/${lower}/ogd-nbcn_${lower}_d_recent.csv`
    : `${BASE}/ch.meteoschweiz.ogd-smn/${lower}/ogd-smn_${lower}_d_recent.csv`;
}

/**
 * Overlay the current-year daily file onto a prebuilt station.
 *
 * The build only covers years up to the last historical file, so without this
 * the dashboard would show nothing for the year in progress. A missing or
 * unreachable recent file is not an error: the history is still worth showing.
 */
export async function mergeRecent(
  st: PackedStation,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<PackedStation> {
  let text: string;
  try {
    const res = await fetchImpl(recentUrl(st));
    if (!res.ok) return st;
    text = decodeLatin1(await res.arrayBuffer());
  } catch {
    return st;
  }

  const rows = readDailyCsv(text, st.source === 'nbcn' ? 'nbcn' : 'smn');
  if (rows.length === 0) return st;

  const packedRecent = packRows(rows);
  const toYear = Math.max(st.toYear, packedRecent.toYear);
  if (toYear === st.toYear) {
    // Same span: write in place on copies.
    const out = { ...st, mean: [...st.mean], max: [...st.max], min: [...st.min] };
    applyRows(out, rows);
    return out;
  }

  // Grow the arrays to cover the new years, preserving existing values.
  const grown: PackedStation = {
    ...st,
    toYear,
    mean: allocateSeries(st.fromYear, toYear),
    max: allocateSeries(st.fromYear, toYear),
    min: allocateSeries(st.fromYear, toYear),
  };
  const oldLen = (st.toYear - st.fromYear + 1) * SLOTS_PER_YEAR;
  for (let i = 0; i < oldLen; i++) {
    grown.mean[i] = st.mean[i];
    grown.max[i] = st.max[i];
    grown.min[i] = st.min[i];
  }
  applyRows(grown, rows);
  return grown;
}

function applyRows(
  st: PackedStation,
  rows: ReturnType<typeof readDailyCsv>,
): void {
  for (const r of rows) {
    if (r.year < st.fromYear || r.year > st.toYear) continue;
    const i = indexFor(st.fromYear, r.year, r.month, r.day);
    st.mean[i] = encodeValue(r.mean);
    st.max[i] = encodeValue(r.max);
    st.min[i] = encodeValue(r.min);
  }
}
```

- [ ] **Step 4: Write `src/lib/sources/smnLive.ts`**

```ts
// src/lib/sources/smnLive.ts
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
```

- [ ] **Step 5: Write `src/lib/sources/openMeteo.ts`**

```ts
// src/lib/sources/openMeteo.ts
import type { DayPoint, Metric } from '../../types';
import type { FetchLike } from './stationIndex';

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
  altitude: number;
  admin1: string;
}

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/** Earliest year in the ERA5 reanalysis archive. */
export const OPEN_METEO_FROM_YEAR = 1940;

export async function geocode(
  name: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<GeocodeResult[]> {
  const url = `${GEO}?name=${encodeURIComponent(name)}&count=8&countryCode=CH&language=de`;
  const res = await fetchImpl(url);
  if (!res.ok) return [];
  const body = (await res.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      elevation?: number;
      admin1?: string;
    }>;
  };
  return (body.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    altitude: r.elevation ?? 0,
    admin1: r.admin1 ?? '',
  }));
}

const DAILY_VARS = 'temperature_2m_mean,temperature_2m_max,temperature_2m_min';

/**
 * One calendar day across every archive year, for a place with no nearby
 * station. Requests the whole archive span once and filters client-side, since
 * the API has no "same day every year" query.
 */
export async function openMeteoDaily(
  lat: number,
  lon: number,
  month: number,
  day: number,
  toYear: number,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<Record<Metric, DayPoint[]>> {
  const url =
    `${ARCHIVE}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${OPEN_METEO_FROM_YEAR}-01-01&end_date=${toYear}-12-31` +
    `&daily=${DAILY_VARS}&timezone=Europe%2FZurich`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Open-Meteo archive failed (${res.status})`);
  const body = (await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_mean: Array<number | null>;
      temperature_2m_max: Array<number | null>;
      temperature_2m_min: Array<number | null>;
    };
  };

  const out: Record<Metric, DayPoint[]> = { mean: [], max: [], min: [] };
  const d = body.daily;
  if (!d) return out;

  const suffix = `-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  for (let i = 0; i < d.time.length; i++) {
    if (!d.time[i].endsWith(suffix)) continue;
    const year = Number(d.time[i].slice(0, 4));
    const push = (m: Metric, v: number | null) => {
      if (v !== null) out[m].push({ year, value: v });
    };
    push('mean', d.temperature_2m_mean[i]);
    push('max', d.temperature_2m_max[i]);
    push('min', d.temperature_2m_min[i]);
  }
  return out;
}

export async function openMeteoCurrent(
  lat: number,
  lon: number,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<number | null> {
  const url = `${FORECAST}?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=Europe%2FZurich`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const body = (await res.json()) as { current?: { temperature_2m?: number } };
  return body.current?.temperature_2m ?? null;
}
```

- [ ] **Step 6: Write `src/lib/sources/dailyRecent.ts` re-export**

```ts
// src/lib/sources/dailyRecent.ts
// The recent-file merge lives with the packed loader because the two always
// travel together; this module exists so callers can import it by intent.
export { mergeRecent } from './packedStation';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/sources/sources.test.ts`
Expected: all PASS.

- [ ] **Step 8: Run the full suite and typecheck**

```bash
npm test
npx tsc -b
```

Expected: all tests pass, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sources/
git commit -m "feat: add runtime data sources with injectable fetch"
```

---

### Task 11: Filter components

**Files:**
- Create: `src/components/PlacePicker.tsx`, `src/components/DateControl.tsx`, `src/components/MetricToggle.tsx`
- Test: `src/components/filters.test.ts`

**Interfaces:**
- Consumes: Tasks 8, 10.
- Produces:
  - `searchStations(index: StationIndexEntry[], query: string, limit?: number): StationIndexEntry[]` (exported from `PlacePicker.tsx`)
  - `clampDate(iso: string, today: string): string` (exported from `DateControl.tsx`)
  - React components `PlacePicker`, `DateControl`, `MetricToggle` with the props shown below.

The searching and clamping logic is pure and tested; the JSX is thin enough to verify by eye in Task 14.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/filters.test.ts
import { describe, expect, it } from 'vitest';
import { searchStations } from './PlacePicker';
import { clampDate } from './DateControl';
import type { StationIndexEntry } from '../types';

const mk = (abbr: string, name: string, canton: string): StationIndexEntry => ({
  abbr,
  name,
  canton,
  lat: 47,
  lon: 8,
  altitude: 400,
  source: 'smn',
  homogenised: false,
  fromYear: 1990,
  toYear: 2025,
});

const index = [
  mk('BAS', 'Basel / Binningen', 'BL'),
  mk('BUS', 'Buchs / Aarau', 'AG'),
  mk('SMA', 'Zürich / Fluntern', 'ZH'),
  mk('GRC', 'Grächen', 'VS'),
];

describe('searchStations', () => {
  it('matches on station name, case-insensitively', () => {
    expect(searchStations(index, 'aarau').map((s) => s.abbr)).toEqual(['BUS']);
  });

  it('matches on abbreviation', () => {
    expect(searchStations(index, 'sma').map((s) => s.abbr)).toEqual(['SMA']);
  });

  it('matches on canton', () => {
    expect(searchStations(index, 'VS').map((s) => s.abbr)).toEqual(['GRC']);
  });

  it('matches accented names typed without accents', () => {
    expect(searchStations(index, 'zurich').map((s) => s.abbr)).toEqual(['SMA']);
    expect(searchStations(index, 'grachen').map((s) => s.abbr)).toEqual(['GRC']);
  });

  it('prefers matches at the start of the name', () => {
    const got = searchStations([mk('X', 'Alt Basel', 'ZH'), mk('BAS', 'Basel', 'BL')], 'basel');
    expect(got[0].abbr).toBe('BAS');
  });

  it('returns an empty list for a blank query', () => {
    expect(searchStations(index, '   ')).toEqual([]);
  });

  it('honours the limit', () => {
    expect(searchStations(index, 'a', 2)).toHaveLength(2);
  });
});

describe('clampDate', () => {
  it('keeps a past date', () => {
    expect(clampDate('2020-01-15', '2026-07-30')).toBe('2020-01-15');
  });

  it('clamps a future date to today', () => {
    expect(clampDate('2030-01-01', '2026-07-30')).toBe('2026-07-30');
  });

  it('keeps today', () => {
    expect(clampDate('2026-07-30', '2026-07-30')).toBe('2026-07-30');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/filters.test.ts`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Write `src/components/PlacePicker.tsx`**

```tsx
// src/components/PlacePicker.tsx
import { useMemo, useState } from 'react';
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

export interface PlacePickerProps {
  index: StationIndexEntry[];
  selected: StationIndexEntry | null;
  onSelect: (station: StationIndexEntry) => void;
}

export function PlacePicker({ index, selected, onSelect }: PlacePickerProps) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchStations(index, query), [index, query]);

  return (
    <div className="place-picker">
      <label htmlFor="place">Station</label>
      <input
        id="place"
        type="search"
        value={query}
        placeholder={selected ? selected.name : 'Aarau, Basel, Davos…'}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {results.length > 0 && (
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
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/DateControl.tsx`**

```tsx
// src/components/DateControl.tsx

/** Never let the user ask for a day that has not happened yet. */
export function clampDate(iso: string, today: string): string {
  return iso > today ? today : iso;
}

export interface DateControlProps {
  value: string; // YYYY-MM-DD
  today: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
}

export function DateControl({ value, today, onChange }: DateControlProps) {
  return (
    <div className="date-control">
      <label htmlFor="date">Day</label>
      <input
        id="date"
        type="date"
        value={value}
        max={today}
        onChange={(e) => onChange(clampDate(e.target.value, today))}
      />
      {value !== today && (
        <button type="button" onClick={() => onChange(today)}>
          Back to today
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/MetricToggle.tsx`**

```tsx
// src/components/MetricToggle.tsx
import type { Metric } from '../types';

const LABELS: Record<Metric, string> = {
  mean: 'Daily mean',
  max: 'Daily max',
  min: 'Daily min',
};

export interface MetricToggleProps {
  value: Metric;
  onChange: (m: Metric) => void;
}

export function MetricToggle({ value, onChange }: MetricToggleProps) {
  return (
    <div className="metric-toggle" role="group" aria-label="Temperature metric">
      {(Object.keys(LABELS) as Metric[]).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={m === value}
          className={m === value ? 'active' : ''}
          onClick={() => onChange(m)}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/filters.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/
git commit -m "feat: add place, date and metric filter components"
```

---

### Task 12: Headline reading card and source note

**Files:**
- Create: `src/lib/headline.ts`, `src/components/CurrentReadingCard.tsx`, `src/components/SourceNote.tsx`
- Test: `src/lib/headline.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 7, 8.
- Produces:
  - `type Headline = { rank: number | null; total: number; deviation: number | null; hottest: DayPoint | null; coldest: DayPoint | null; provisional: boolean; comparedValue: number | null }`
  - `buildHeadline(args: { points: DayPoint[]; soFar: DaySoFar | null; metric: Metric; isToday: boolean; selectedYearValue: number | null }): Headline`
  - `ordinal(n: number): string`
  - Components `CurrentReadingCard`, `SourceNote`.

`buildHeadline` is where the honest-comparison rule lives: the compared value is the day-so-far figure for the *same* metric, and `provisional` is true whenever it came from an unfinished day.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/headline.test.ts
import { describe, expect, it } from 'vitest';
import { buildHeadline, ordinal } from './headline';
import type { DayPoint } from '../types';
import type { DaySoFar } from './dayAggregate';

const points: DayPoint[] = [
  { year: 2020, value: 20 },
  { year: 2021, value: 22 },
  { year: 2022, value: 24 },
];

const soFar: DaySoFar = {
  mean: 21,
  max: 30,
  min: 12,
  latest: { year: 2026, month: 7, day: 30, hour: 14, minute: 20, celsius: 26.3 },
  count: 86,
};

describe('ordinal', () => {
  it('handles the teens correctly', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('handles 1, 2, 3 and 21', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(21)).toBe('21st');
  });
});

describe('buildHeadline', () => {
  it('compares the day-so-far value of the SAME metric, not the latest reading', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'max',
      isToday: true,
      selectedYearValue: null,
    });
    // soFar.max is 30, which beats every historical point.
    expect(h.comparedValue).toBe(30);
    expect(h.rank).toBe(1);
    expect(h.provisional).toBe(true);
  });

  it('uses the mean when the mean metric is selected', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    // 22 and 24 are warmer than 21, so this is the 3rd-warmest of three.
    expect(h.comparedValue).toBe(21);
    expect(h.rank).toBe(3);
  });

  it('is not provisional for a past date and uses that year value', () => {
    const h = buildHeadline({
      points,
      soFar: null,
      metric: 'mean',
      isToday: false,
      selectedYearValue: 24,
    });
    expect(h.provisional).toBe(false);
    expect(h.comparedValue).toBe(24);
    expect(h.rank).toBe(1);
  });

  it('reports total and extremes', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.total).toBe(3);
    expect(h.hottest).toEqual({ year: 2022, value: 24 });
    expect(h.coldest).toEqual({ year: 2020, value: 20 });
  });

  it('yields a null rank when there is nothing to compare', () => {
    const h = buildHeadline({
      points,
      soFar: null,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.rank).toBeNull();
    expect(h.comparedValue).toBeNull();
  });

  it('suppresses deviation when the norm window is too thin', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.deviation).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/headline.test.ts`
Expected: FAIL — cannot resolve `./headline`.

- [ ] **Step 3: Write `src/lib/headline.ts`**

```ts
// src/lib/headline.ts
import type { DayPoint, Metric } from '../types';
import type { DaySoFar } from './dayAggregate';
import { extremes, normDeviation, rankDescending } from './series';

export interface Headline {
  rank: number | null;
  total: number;
  deviation: number | null;
  hottest: DayPoint | null;
  coldest: DayPoint | null;
  /** True when the compared value comes from a day still in progress. */
  provisional: boolean;
  comparedValue: number | null;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Pick the value to rank against history.
 *
 * Ranking an instantaneous reading against historical daily means is a category
 * error, so for today we take the day-so-far figure for the *same* metric the
 * user selected, and mark it provisional because the day is not over.
 */
export function buildHeadline(args: {
  points: DayPoint[];
  soFar: DaySoFar | null;
  metric: Metric;
  isToday: boolean;
  selectedYearValue: number | null;
}): Headline {
  const { points, soFar, metric, isToday, selectedYearValue } = args;

  let comparedValue: number | null;
  let provisional: boolean;
  if (isToday) {
    comparedValue = soFar === null ? null : soFar[metric];
    provisional = soFar !== null;
  } else {
    comparedValue = selectedYearValue;
    provisional = false;
  }

  const ext = extremes(points);
  return {
    rank: comparedValue === null ? null : rankDescending(points, comparedValue),
    total: points.length,
    deviation: comparedValue === null ? null : normDeviation(points, comparedValue),
    hottest: ext?.hottest ?? null,
    coldest: ext?.coldest ?? null,
    provisional,
    comparedValue,
  };
}
```

- [ ] **Step 4: Write `src/components/CurrentReadingCard.tsx`**

```tsx
// src/components/CurrentReadingCard.tsx
import type { Metric } from '../types';
import type { DaySoFar } from '../lib/dayAggregate';
import { ordinal, type Headline } from '../lib/headline';

const METRIC_WORD: Record<Metric, string> = {
  mean: 'mean',
  max: 'max',
  min: 'min',
};

const fmt = (n: number) => `${n.toFixed(1)} °C`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} °C`;

export interface CurrentReadingCardProps {
  placeLabel: string;
  dateLabel: string;
  metric: Metric;
  headline: Headline;
  soFar: DaySoFar | null;
  liveStationName: string | null;
  liveDistanceKm: number | null;
}

export function CurrentReadingCard({
  placeLabel,
  dateLabel,
  metric,
  headline,
  soFar,
  liveStationName,
  liveDistanceKm,
}: CurrentReadingCardProps) {
  const latest = soFar?.latest;
  const clock = latest
    ? `${String(latest.hour).padStart(2, '0')}:${String(latest.minute).padStart(2, '0')}`
    : null;

  return (
    <section className="reading-card">
      <h2>
        {placeLabel}
        {latest && <> · now {fmt(latest.celsius)}</>}
      </h2>

      {liveStationName && (
        <p className="reading-provenance">
          {liveStationName}
          {liveDistanceKm !== null && liveDistanceKm > 0 && <> · {liveDistanceKm} km</>}
          {clock && <> · {clock}</>}
        </p>
      )}

      {soFar && (
        <p className="reading-sofar">
          Day so far: max {fmt(soFar.max)}, mean {fmt(soFar.mean)}, min {fmt(soFar.min)}
          {headline.provisional && <em> · still in progress</em>}
        </p>
      )}

      <p className="reading-rank">
        {headline.rank !== null && headline.total > 0 ? (
          <>
            {ordinal(headline.rank)}-warmest {dateLabel} {METRIC_WORD[metric]} of{' '}
            {headline.total} years
          </>
        ) : (
          <>No comparable reading for {dateLabel} yet</>
        )}
        {headline.deviation !== null && (
          <> · {signed(headline.deviation)} vs the 1991–2020 norm</>
        )}
      </p>

      {headline.hottest && headline.coldest && (
        <p className="reading-records">
          Record {fmt(headline.hottest.value)} ({headline.hottest.year}) · Lowest{' '}
          {fmt(headline.coldest.value)} ({headline.coldest.year})
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write `src/components/SourceNote.tsx`**

```tsx
// src/components/SourceNote.tsx
import type { SourcePlan } from '../types';

export interface SourceNoteProps {
  plan: SourcePlan;
  usesOpenMeteo: boolean;
}

export function SourceNote({ plan, usesOpenMeteo }: SourceNoteProps) {
  return (
    <footer className="source-note">
      <ul>
        {plan.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="attribution">
        Source: MeteoSwiss
        {usesOpenMeteo && <> · Weather data by Open-Meteo.com</>}
      </p>
    </footer>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/headline.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/headline.ts src/lib/headline.test.ts src/components/CurrentReadingCard.tsx src/components/SourceNote.tsx
git commit -m "feat: add headline ranking card with provisional-day handling"
```

---

### Task 13: The chart

**Files:**
- Create: `src/lib/chartData.ts`, `src/components/DayAcrossYearsChart.tsx`
- Test: `src/lib/chartData.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 12.
- Produces:
  - `type TrendSegment = { from: { x: number; y: number }; to: { x: number; y: number } } | null`
  - `trendSegment(points: DayPoint[]): TrendSegment`
  - `yDomain(points: DayPoint[], extra: number[]): [number, number]`
  - Component `DayAcrossYearsChart`.

Recharts has no built-in regression line, so the slope from Task 6 is turned into an explicit two-point segment and drawn with `ReferenceLine segment={…}`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chartData.test.ts
import { describe, expect, it } from 'vitest';
import { trendSegment, yDomain } from './chartData';
import type { DayPoint } from '../types';

const rising: DayPoint[] = Array.from({ length: 40 }, (_, i) => ({
  year: 1980 + i,
  value: 10 + i * 0.1,
}));

describe('trendSegment', () => {
  it('spans the first and last year', () => {
    const seg = trendSegment(rising)!;
    expect(seg.from.x).toBe(1980);
    expect(seg.to.x).toBe(2019);
  });

  it('follows the fitted slope', () => {
    const seg = trendSegment(rising)!;
    expect(seg.to.y - seg.from.y).toBeCloseTo(3.9, 6);
  });

  it('returns null below the 30-year trend floor', () => {
    expect(trendSegment(rising.slice(0, 20))).toBeNull();
  });

  it('returns null for an empty series', () => {
    expect(trendSegment([])).toBeNull();
  });
});

describe('yDomain', () => {
  it('pads the range by 1 degree and rounds outward', () => {
    const [lo, hi] = yDomain([{ year: 2000, value: 10.2 }, { year: 2001, value: 20.7 }], []);
    expect(lo).toBeLessThanOrEqual(9);
    expect(hi).toBeGreaterThanOrEqual(21);
  });

  it('includes extra values such as today', () => {
    const [, hi] = yDomain([{ year: 2000, value: 10 }], [35]);
    expect(hi).toBeGreaterThanOrEqual(36);
  });

  it('falls back to a sane range with no data', () => {
    expect(yDomain([], [])).toEqual([0, 10]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chartData.test.ts`
Expected: FAIL — cannot resolve `./chartData`.

- [ ] **Step 3: Write `src/lib/chartData.ts`**

```ts
// src/lib/chartData.ts
import type { DayPoint } from '../types';
import { trendPerCentury } from './series';

export interface TrendSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Recharts cannot fit a regression line, so express the trend as the two
 * endpoints of a straight segment through the series mean.
 */
export function trendSegment(points: DayPoint[]): TrendSegment | null {
  const perCentury = trendPerCentury(points);
  if (perCentury === null || points.length === 0) return null;

  const perYear = perCentury / 100;
  const years = points.map((p) => p.year);
  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);
  const meanYear = years.reduce((a, b) => a + b, 0) / years.length;
  const meanValue = points.reduce((a, p) => a + p.value, 0) / points.length;

  return {
    from: { x: firstYear, y: meanValue + (firstYear - meanYear) * perYear },
    to: { x: lastYear, y: meanValue + (lastYear - meanYear) * perYear },
  };
}

export function yDomain(points: DayPoint[], extra: number[]): [number, number] {
  const values = [...points.map((p) => p.value), ...extra];
  if (values.length === 0) return [0, 10];
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  return [lo, hi];
}
```

- [ ] **Step 4: Write `src/components/DayAcrossYearsChart.tsx`**

```tsx
// src/components/DayAcrossYearsChart.tsx
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayPoint, Metric } from '../types';
import { trendSegment, yDomain } from '../lib/chartData';
import { trendPerCentury } from '../lib/series';

const METRIC_LABEL: Record<Metric, string> = {
  mean: 'Daily mean (°C)',
  max: 'Daily max (°C)',
  min: 'Daily min (°C)',
};

export interface DayAcrossYearsChartProps {
  points: DayPoint[];
  metric: Metric;
  dateLabel: string;
  /** Today's provisional value, drawn as a distinct highlighted point. */
  todayValue: number | null;
  todayYear: number;
  homogenised: boolean;
}

export function DayAcrossYearsChart({
  points,
  metric,
  dateLabel,
  todayValue,
  todayYear,
  homogenised,
}: DayAcrossYearsChartProps) {
  if (points.length === 0) {
    return <p className="chart-empty">No data recorded for {dateLabel} at this station.</p>;
  }

  const seg = trendSegment(points);
  const perCentury = trendPerCentury(points);
  const domain = yDomain(points, todayValue === null ? [] : [todayValue]);
  const todayPoints = todayValue === null ? [] : [{ year: todayYear, value: todayValue }];

  return (
    <figure className="chart">
      <figcaption>
        {dateLabel} · {METRIC_LABEL[metric]} · {points.length} years
      </figcaption>

      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" />
          <XAxis
            type="number"
            dataKey="year"
            domain={['dataMin - 1', 'dataMax + 1']}
            allowDecimals={false}
            tickCount={8}
            name="Year"
          />
          <YAxis
            type="number"
            dataKey="value"
            domain={domain}
            tickFormatter={(v: number) => `${v}°`}
            name={METRIC_LABEL[metric]}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)} °C`, METRIC_LABEL[metric]]}
            labelFormatter={() => dateLabel}
          />

          {seg && (
            <ReferenceLine
              segment={[seg.from, seg.to]}
              stroke="currentColor"
              strokeWidth={2}
              strokeOpacity={0.5}
              ifOverflow="extendDomain"
            />
          )}

          <Scatter name="Past years" data={points} fillOpacity={0.55} r={3} />
          {todayPoints.length > 0 && (
            <Scatter name="Today" data={todayPoints} shape="circle" r={7} />
          )}
        </ScatterChart>
      </ResponsiveContainer>

      <p className="chart-trend">
        {perCentury === null ? (
          <>Trend not shown — fewer than 30 years of record.</>
        ) : (
          <>
            Trend {perCentury >= 0 ? '+' : '−'}
            {Math.abs(perCentury).toFixed(1)} °C per century
            {!homogenised && <> · raw series, not homogenised</>}
          </>
        )}
      </p>
    </figure>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/chartData.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chartData.ts src/lib/chartData.test.ts src/components/DayAcrossYearsChart.tsx
git commit -m "feat: add day-across-years scatter chart with trend segment"
```

---

### Task 14: Wire the app together

**Files:**
- Create: `src/hooks/useStationSeries.ts`, `src/lib/dateUtil.ts`, `src/styles.css`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/lib/dateUtil.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 7, 8, 10, 11, 12, 13.
- Produces: a running dashboard at `npm run dev`.
  - `todayIso(now?: Date): string`, `parseIso(iso: string): { year: number; month: number; day: number }`, `formatDayLabel(iso: string): string`
  - `useStationSeries(abbr: string | null)` → `{ station, live, loading, error }`

- [ ] **Step 1: Write the failing test for date helpers**

```ts
// src/lib/dateUtil.test.ts
import { describe, expect, it } from 'vitest';
import { formatDayLabel, parseIso, todayIso } from './dateUtil';

describe('todayIso', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 6, 30))).toBe('2026-07-30');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseIso', () => {
  it('splits an ISO date', () => {
    expect(parseIso('2026-07-30')).toEqual({ year: 2026, month: 7, day: 30 });
  });

  it('throws on a malformed value', () => {
    expect(() => parseIso('30.07.2026')).toThrow(/ISO date/i);
  });
});

describe('formatDayLabel', () => {
  it('renders a day and month without the year', () => {
    expect(formatDayLabel('2026-07-30')).toBe('30 July');
    expect(formatDayLabel('2026-02-29')).toBe('29 February');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dateUtil.test.ts`
Expected: FAIL — cannot resolve `./dateUtil`.

- [ ] **Step 3: Write `src/lib/dateUtil.ts`**

```ts
// src/lib/dateUtil.ts
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date, not UTC — "today" must match the user's wall clock. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIso(iso: string): { year: number; month: number; day: number } {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Expected an ISO date (YYYY-MM-DD), got "${iso}"`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatDayLabel(iso: string): string {
  const { month, day } = parseIso(iso);
  return `${day} ${MONTHS[month - 1]}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/dateUtil.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write `src/hooks/useStationSeries.ts`**

```ts
// src/hooks/useStationSeries.ts
import { useEffect, useState } from 'react';
import type { PackedStation } from '../types';
import { loadPackedStation, mergeRecent } from '../lib/sources/packedStation';
import { loadLive } from '../lib/sources/smnLive';
import { daySoFar, isStale, type DaySoFar } from '../lib/dayAggregate';

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
        const station = await mergeRecent(base);
        // Live data is best-effort; loadLive already swallows its own failures.
        const readings = await loadLive(abbr);
        if (cancelled) return;

        // A station that stopped reporting hours ago must not be presented as
        // "now" — drop the aggregate and let the UI say the live feed is stale.
        const aggregate = daySoFar(readings);
        const stale = aggregate !== null && isStale(aggregate.latest, new Date());

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
```

- [ ] **Step 6: Rewrite `src/App.tsx`**

```tsx
// src/App.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Metric, StationIndexEntry } from './types';
import { loadStationIndex } from './lib/sources/stationIndex';
import { useStationSeries } from './hooks/useStationSeries';
import { dayAcrossYears } from './lib/series';
import { buildHeadline } from './lib/headline';
import { resolveStation } from './lib/resolvePlace';
import { formatDayLabel, parseIso, todayIso } from './lib/dateUtil';
import { PlacePicker } from './components/PlacePicker';
import { DateControl } from './components/DateControl';
import { MetricToggle } from './components/MetricToggle';
import { CurrentReadingCard } from './components/CurrentReadingCard';
import { DayAcrossYearsChart } from './components/DayAcrossYearsChart';
import { SourceNote } from './components/SourceNote';
import './styles.css';

const DEFAULT_STATION = 'SMA'; // Zürich / Fluntern

export function App() {
  const today = todayIso();
  const [index, setIndex] = useState<StationIndexEntry[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StationIndexEntry | null>(null);
  const [date, setDate] = useState(today);
  const [metric, setMetric] = useState<Metric>('mean');

  useEffect(() => {
    loadStationIndex()
      .then((idx) => {
        setIndex(idx);
        setSelected(idx.find((s) => s.abbr === DEFAULT_STATION) ?? idx[0] ?? null);
      })
      .catch((e: unknown) =>
        setIndexError(
          `Could not load the station index — did you run "npm run build:data"? (${
            e instanceof Error ? e.message : String(e)
          })`,
        ),
      );
  }, []);

  const { station, soFar, liveStale, loading, error } = useStationSeries(
    selected?.abbr ?? null,
  );
  const { month, day } = parseIso(date);
  const isToday = date === today;

  const points = useMemo(
    () => (station ? dayAcrossYears(station, month, day, metric) : []),
    [station, month, day, metric],
  );

  const selectedYearValue = useMemo(() => {
    if (isToday) return null;
    const { year } = parseIso(date);
    return points.find((p) => p.year === year)?.value ?? null;
  }, [isToday, date, points]);

  const headline = useMemo(
    () => buildHeadline({ points, soFar, metric, isToday, selectedYearValue }),
    [points, soFar, metric, isToday, selectedYearValue],
  );

  const plan = useMemo(
    () => (selected ? resolveStation(selected, index) : null),
    [selected, index],
  );

  if (indexError) return <main className="app"><p className="error">{indexError}</p></main>;

  return (
    <main className="app">
      <header>
        <h1>Swiss temperature — this day in history</h1>
      </header>

      <div className="controls">
        <PlacePicker index={index} selected={selected} onSelect={setSelected} />
        <DateControl value={date} today={today} onChange={setDate} />
        <MetricToggle value={metric} onChange={setMetric} />
      </div>

      {loading && <p className="status">Loading {selected?.name}…</p>}
      {error && <p className="error">{error}</p>}
      {liveStale && isToday && (
        <p className="status">
          This station's live feed has not reported in over two hours — showing history only.
        </p>
      )}

      {station && plan && (
        <>
          <CurrentReadingCard
            placeLabel={plan.label}
            dateLabel={formatDayLabel(date)}
            metric={metric}
            headline={headline}
            soFar={isToday ? soFar : null}
            liveStationName={plan.liveStation?.name ?? null}
            liveDistanceKm={plan.liveDistanceKm}
          />

          <DayAcrossYearsChart
            points={points}
            metric={metric}
            dateLabel={formatDayLabel(date)}
            todayValue={isToday ? headline.comparedValue : selectedYearValue}
            todayYear={parseIso(isToday ? today : date).year}
            homogenised={station.homogenised}
          />

          <SourceNote plan={plan} usesOpenMeteo={false} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Write a minimal `src/styles.css`**

```css
:root {
  color-scheme: light dark;
  --fg: #16181d;
  --bg: #fbfbfa;
  --muted: #6b7280;
  --accent: #b4451f;
  --line: #d8d6d1;
}
@media (prefers-color-scheme: dark) {
  :root { --fg: #e8e6e3; --bg: #16181d; --muted: #9aa0aa; --accent: #ff8a5c; --line: #2c2f37; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
.app { max-width: 60rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
h1 { font-size: 1.5rem; letter-spacing: -0.01em; }
.controls { display: flex; flex-wrap: wrap; gap: 1.25rem; align-items: flex-end;
  padding: 1rem 0 1.5rem; border-bottom: 1px solid var(--line); }
.controls label { display: block; font-size: 0.75rem; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--muted); margin-bottom: 0.25rem; }
input[type='search'], input[type='date'] { font: inherit; padding: 0.4rem 0.6rem;
  border: 1px solid var(--line); border-radius: 4px; background: var(--bg); color: var(--fg); }
.place-picker { position: relative; }
.place-results { position: absolute; z-index: 10; margin: 0.25rem 0 0; padding: 0;
  list-style: none; background: var(--bg); border: 1px solid var(--line);
  border-radius: 4px; width: 22rem; max-height: 18rem; overflow-y: auto; }
.place-results button { display: block; width: 100%; text-align: left; padding: 0.5rem 0.7rem;
  background: none; border: 0; color: inherit; font: inherit; cursor: pointer; }
.place-results button:hover { background: color-mix(in oklab, var(--fg) 8%, transparent); }
.place-name { display: block; }
.place-meta { display: block; font-size: 0.8rem; color: var(--muted); }
.metric-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.metric-toggle button { font: inherit; padding: 0.4rem 0.8rem; background: none;
  border: 0; border-right: 1px solid var(--line); color: inherit; cursor: pointer; }
.metric-toggle button:last-child { border-right: 0; }
.metric-toggle button.active { background: var(--accent); color: #fff; }
.reading-card { padding: 1.5rem 0 0.5rem; }
.reading-card h2 { font-size: 1.75rem; margin: 0 0 0.25rem; }
.reading-provenance, .reading-records { color: var(--muted); font-size: 0.9rem; margin: 0.25rem 0; }
.reading-sofar em { color: var(--accent); font-style: normal; }
.reading-rank { font-size: 1.05rem; margin: 0.5rem 0; }
.chart { margin: 1.5rem 0 0; }
.chart figcaption { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.5rem; }
.chart-trend { font-size: 0.9rem; color: var(--muted); }
.source-note { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line);
  font-size: 0.8rem; color: var(--muted); }
.source-note ul { margin: 0 0 0.75rem; padding-left: 1.1rem; }
.attribution { font-weight: 500; }
.error { color: var(--accent); }
.recharts-surface { color: var(--fg); }
```

- [ ] **Step 8: Run the whole suite and typecheck**

```bash
npm test
npx tsc -b
```

Expected: every test passes, no type errors.

- [ ] **Step 9: Run the dev server and verify by hand**

```bash
npm run dev
```

Check in the browser:
1. Zürich / Fluntern loads by default with a scatter of ~160 points.
2. Search `aarau` → "Buchs / Aarau" appears with `AG · 387 m · from 1984`; selecting it redraws with 42 points and shows the "raw series, not homogenised" caveat.
3. Switch metric to **Daily max** on Basel → the series starts at 1897, not 1864.
4. Set the date to `2026-02-29` → rejected (not a valid date in 2026); set `2024-02-29` → about 40 points.
5. Pick a station starting after 1996 → the trend line is absent and the caption says fewer than 30 years.
6. "Source: MeteoSwiss" is visible at the bottom.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: wire dashboard together with station index, chart and card"
```

---

### Task 15: Open-Meteo fallback for places without a station

**Files:**
- Create: `src/lib/sources/openMeteoSeries.ts`
- Test: `src/lib/sources/openMeteoSeries.test.ts`
- Modify: `src/App.tsx` (add geocoded-place branch), `src/components/PlacePicker.tsx` (add geocoder results)

**Interfaces:**
- Consumes: Tasks 8, 10.
- Produces: `openMeteoDayPoints(place, month, day, toYear, fetchImpl?): Promise<Record<Metric, DayPoint[]>>` and a `PlacePicker` that offers geocoded places when no station matches.

This is the last tier from the spec. It is deliberately last: everything above works without it, so if it is cut the dashboard still covers all 149 stations.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sources/openMeteoSeries.test.ts
import { describe, expect, it, vi } from 'vitest';
import { openMeteoDaily } from './openMeteo';

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe('openMeteoDaily', () => {
  it('keeps only the requested calendar day and tags each with its year', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        daily: {
          time: ['1940-07-29', '1940-07-30', '1941-07-30', '1941-08-01'],
          temperature_2m_mean: [10, 13.3, 14.1, 20],
          temperature_2m_max: [15, 17.7, 18.2, 25],
          temperature_2m_min: [5, 8.0, 9.1, 15],
        },
      }),
    );
    const got = await openMeteoDaily(47.39, 8.04, 7, 30, 1941, f);
    expect(got.mean).toEqual([
      { year: 1940, value: 13.3 },
      { year: 1941, value: 14.1 },
    ]);
    expect(got.max[0].value).toBe(17.7);
  });

  it('requests the archive from 1940', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ daily: { time: [], temperature_2m_mean: [], temperature_2m_max: [], temperature_2m_min: [] } }));
    await openMeteoDaily(47, 8, 1, 1, 2026, f);
    expect(f.mock.calls[0][0]).toContain('start_date=1940-01-01');
  });

  it('skips null values rather than emitting them as zero', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        daily: {
          time: ['1940-07-30', '1941-07-30'],
          temperature_2m_mean: [null, 14.1],
          temperature_2m_max: [17.7, null],
          temperature_2m_min: [8, 9],
        },
      }),
    );
    const got = await openMeteoDaily(47, 8, 7, 30, 1941, f);
    expect(got.mean).toEqual([{ year: 1941, value: 14.1 }]);
    expect(got.max).toEqual([{ year: 1940, value: 17.7 }]);
  });

  it('returns empty arrays when the response has no daily block', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({}));
    const got = await openMeteoDaily(47, 8, 7, 30, 2026, f);
    expect(got).toEqual({ mean: [], max: [], min: [] });
  });

  it('throws on a failed request', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(openMeteoDaily(47, 8, 7, 30, 2026, f)).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/lib/sources/openMeteoSeries.test.ts`
Expected: PASS — `openMeteoDaily` was written in Task 10. If it fails, fix `openMeteo.ts` to match these tests; they are the specification for it.

- [ ] **Step 3: Add geocoded places to `PlacePicker`**

Replace the `PlacePickerProps` interface and component body in `src/components/PlacePicker.tsx` with this version, keeping `fold` and `searchStations` exactly as they are:

```tsx
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
```

Add `useEffect` to the React import at the top of the file:

```tsx
import { useEffect, useMemo, useState } from 'react';
```

- [ ] **Step 4: Add the geocoded branch to `src/App.tsx`**

Add these imports:

```tsx
import { geocode, openMeteoDaily } from './lib/sources/openMeteo';
import { resolveGeocoded } from './lib/resolvePlace';
import type { DayPoint } from './types';
import type { GeocodedPlace } from './components/PlacePicker';
```

Add this state next to the existing `useState` calls:

```tsx
const [place, setPlace] = useState<GeocodedPlace | null>(null);
const [placePoints, setPlacePoints] = useState<Record<Metric, DayPoint[]> | null>(null);
```

Add this effect after the existing ones:

```tsx
// A geocoded place has no station file, so fetch its series from Open-Meteo.
useEffect(() => {
  if (place === null) {
    setPlacePoints(null);
    return;
  }
  let cancelled = false;
  const { year } = parseIso(date);
  openMeteoDaily(place.lat, place.lon, month, day, year)
    .then((r) => !cancelled && setPlacePoints(r))
    .catch(() => !cancelled && setPlacePoints(null));
  return () => {
    cancelled = true;
  };
}, [place, month, day, date]);
```

Change the `points` memo so a geocoded place wins over the station series:

```tsx
const points = useMemo(() => {
  if (place !== null) return placePoints?.[metric] ?? [];
  return station ? dayAcrossYears(station, month, day, metric) : [];
}, [place, placePoints, station, month, day, metric]);
```

Change the `plan` memo to cover both cases:

```tsx
const plan = useMemo(() => {
  if (place !== null) return resolveGeocoded(place, index);
  return selected ? resolveStation(selected, index) : null;
}, [place, selected, index]);
```

Wire the picker up, and clear the geocoded place when a station is chosen:

```tsx
<PlacePicker
  index={index}
  selected={selected}
  onSelect={(s) => {
    setPlace(null);
    setSelected(s);
  }}
  onSelectPlace={setPlace}
  searchPlaces={(q) => geocode(q)}
/>
```

Finally, change the render guard so a geocoded place renders without a `station`, and credit Open-Meteo:

```tsx
{plan && (place !== null || station) && (
  <>
    <CurrentReadingCard
      placeLabel={plan.label}
      dateLabel={formatDayLabel(date)}
      metric={metric}
      headline={headline}
      soFar={isToday && place === null ? soFar : null}
      liveStationName={plan.liveStation?.name ?? null}
      liveDistanceKm={plan.liveDistanceKm}
    />

    <DayAcrossYearsChart
      points={points}
      metric={metric}
      dateLabel={formatDayLabel(date)}
      todayValue={isToday ? headline.comparedValue : selectedYearValue}
      todayYear={parseIso(isToday ? today : date).year}
      homogenised={station?.homogenised ?? false}
    />

    <SourceNote plan={plan} usesOpenMeteo={place !== null} />
  </>
)}
```

- [ ] **Step 5: Run the full suite and typecheck**

```bash
npm test
npx tsc -b
```

Expected: all tests pass, no type errors.

- [ ] **Step 6: Verify the fallback by hand**

```bash
npm run dev
```

Search `Zermatt`. Because it has no station within 15 km, it appears in the results list marked "no station nearby · Open-Meteo from 1940". Selecting it draws a series from 1940 and the footer credits both MeteoSwiss and Open-Meteo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: fall back to Open-Meteo for places with no station within 15 km"
```

---

### Task 16: README and production build

**Files:**
- Create: `README.md`
- Test: manual verification of `npm run build`

**Interfaces:**
- Consumes: everything.
- Produces: a documented, deployable build.

- [ ] **Step 1: Write `README.md`**

```markdown
# Swiss Temperature Dashboard

Pick one of 149 MeteoSwiss stations and see today's temperature ranked against
every recorded value for that same calendar day — back to 1864 at the longest
stations.

## Running it

```bash
npm install
npm run build:data   # fetches ~340 MB of MeteoSwiss CSV, writes public/data (first run only)
npm run dev
```

`build:data` caches raw downloads in `.cache/`, so re-runs are instant. Pass
`--force` to refetch. Re-run it periodically to pick up completed years; the
current year and live values are fetched in the browser and need no rebuild.

## Data sources

| Tier | Collection | Stations | From |
|---|---|---|---|
| Homogenised daily | `ch.meteoschweiz.ogd-nbcn` | 29 | 1864 |
| Measured daily | `ch.meteoschweiz.ogd-smn` | 149 | station-dependent |
| Live 10-minute | `ch.meteoschweiz.ogd-smn` | 149 | today |
| Reanalysis fallback | Open-Meteo ERA5 | anywhere | 1940 |

Source: MeteoSwiss. Weather data by Open-Meteo.com.

## How the comparison stays honest

- Today's value is aggregated from the day's 10-minute readings into a
  day-so-far mean/max/min and compared against the *same* metric historically —
  never an instantaneous reading against historical daily means.
- An unfinished day is labelled "still in progress".
- Trend lines are hidden below 30 years of record, and labelled "raw series, not
  homogenised" for the 120 stations outside the NBCN network.
- Norm deviation is suppressed unless at least 20 of the 30 years 1991–2020 are
  present.

## Architecture

`scripts/build-data.ts` condenses each station's daily history into a packed
integer array with a fixed 366-slot stride per year, so "this day across every
year" is a strided walk rather than a scan. Pure functions in `src/lib` do all
statistics and are tested against real captured fixtures; `src/lib/sources`
holds the only code that touches the network.

## Tests

```bash
npm test
```

Fixtures in `tests/fixtures/` are trimmed real CSVs, regenerated with
`npm run capture:fixtures`.
```

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: `dist/` is produced with no type errors.

- [ ] **Step 3: Preview the production build**

```bash
npm run preview
```

Confirm the dashboard loads and a station renders. `public/data/` is gitignored but is copied into `dist/`, so the preview works locally; any deployment must run `npm run build:data` before `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README covering data sources, honesty rules and architecture"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| latin-1 / `;` / `DD.MM.YYYY` parsing | 2 |
| `MONTH_OFFSET`, 366-slot stride, `MISSING` | 3 |
| Feb 29 at slot 59, Mar 1 at slot 60 | 3, 5 |
| Reference values as test assertions | 4, 6 |
| NBCN `ths200*` and SMN `tre200*` via one reader | 5 |
| `dayAcrossYears`, rank, trend, norm | 6 |
| Trend floor of 30 years | 6, 13 |
| Norm floor of 20 of 30 years | 6, 12 |
| Day-so-far aggregation, provisional labelling | 7, 12 |
| Staleness check at 2 h | 7 (logic), 14 (wired into `useStationSeries` + banner) |
| 15 km live radius, caveats, no proxy series | 8 |
| Coverage from `datainventory`, not `station_data_since` | 9 |
| 149 stations, 29 homogenised, concurrency 8, cache, non-fatal failures | 9 |
| Packed per-station output + index | 9, 10 |
| Current-year merge at runtime | 10 |
| Live fetch degrades to `[]` | 10 |
| Three filters: place, date, metric | 11 |
| Headline card with rank/records/deviation | 12 |
| "Source: MeteoSwiss" attribution | 12, 16 |
| Scatter + highlighted today + trend segment | 13 |
| Raw-series labelling on non-homogenised stations | 8, 13 |
| min/max shorter span shown honestly | 6 (test), 13 |
| Future dates rejected | 11 |
| Open-Meteo fallback beyond 15 km | 15 |
| No reanalysis backfill of short records | by construction — Task 15 replaces the series wholesale for a geocoded place and never splices |

No gaps found.

**2. Placeholder scan**

No "TBD", "handle errors appropriately", or "similar to Task N". Every code step contains complete, runnable code. Task 15 Step 3 restates the whole `PlacePicker` component body rather than describing a diff, and Task 15 Step 4 gives each `App.tsx` edit verbatim.

**3. Type consistency**

- `PackedStation`, `StationIndexEntry`, `DayPoint`, `SourcePlan`, `Metric`, `HistorySource` are defined once in Task 1 and imported everywhere after.
- `Collection` is defined in Task 5 (`dailyCsv.ts`) and imported by Task 9. `PackedStation.source` is `HistorySource` (three values) while `readDailyCsv` takes `Collection` (two), so Task 10 narrows with `st.source === 'nbcn' ? 'nbcn' : 'smn'` — deliberate, and the same narrowing appears in Task 9's `buildOne`.
- `FetchLike` is defined once in Task 10's `stationIndex.ts` and imported by the other source modules.
- `DaySoFar` is defined in Task 7 and consumed by Tasks 12 and 14 under that name.
- `daySoFar[metric]` in Task 12 relies on `DaySoFar` having `mean`/`max`/`min` keys matching `Metric` exactly — it does.
- `GeocodedPlace` is introduced in Task 15 and exported from `PlacePicker.tsx`, which is where Task 15's `App.tsx` imports it from.
- `trendPerCentury` is the single name used in Tasks 6, 13.
