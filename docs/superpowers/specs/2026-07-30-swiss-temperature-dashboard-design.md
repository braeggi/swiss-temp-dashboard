# Swiss Temperature Dashboard — Design

**Date:** 2026-07-30
**Status:** Approved

## Purpose

A dashboard that answers one question well: **is today's temperature unusual for this date, here?**

Pick a Swiss place, see the current measured temperature, and compare it against every
recorded value for that same calendar day — back to 1864 where the record allows.

## Scope

In scope:

- Place selection by name (any Swiss place, including those without a weather station).
- Current temperature from the nearest official measurement.
- "This calendar day across all years" chart with trend, records, and rank.
- Three filters: place, date, metric (mean / max / min).

Explicitly out of scope (considered and cut):

- Year-range slider on the x-axis.
- Smoothing / ±N-day window aggregation.
- Precipitation, sunshine, wind, or any non-temperature parameter.
- Forecasts.
- Multi-place comparison on one chart.

## Data sources

All three were verified live on 2026-07-30. All send `access-control-allow-origin: *`,
so the browser fetches them directly and **no backend is required**.

### NBCN — homogenised climate series (deep history)

- Collection: `ch.meteoschweiz.ogd-nbcn` on `data.geo.admin.ch`
- 29 stations, daily values, earliest 1864-01-01.
- Asset pattern: `https://data.geo.admin.ch/ch.meteoschweiz.ogd-nbcn/<abbr-lowercase>/ogd-nbcn_<abbr>_d_historical.csv`
  plus a `_d_recent.csv` covering the current year.
- Station index: `.../ogd-nbcn_meta_stations.csv`
- Format: `;`-delimited, **latin-1** encoded, timestamps `DD.MM.YYYY HH:MM`.
- Columns used:
  - `ths200d0` — homogenised daily **mean** (100 % coverage from 1864)
  - `ths200dx` — homogenised daily **max** (from 1897, 79 % coverage)
  - `ths200dn` — homogenised daily **min** (from 1897, 79 % coverage)
  - `th9120dv` — deviation of the mean from the 1991–2020 norm (precomputed)
- `_historical.csv` ends 2025-12-31; `_recent.csv` runs into the current year with a
  1–2 day lag.

### SMN — automatic weather stations (live)

- Collection: `ch.meteoschweiz.ogd-smn`
- 158 stations, 10-minute values, file refreshed roughly every 10–20 minutes.
- Asset pattern: `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/<abbr-lowercase>/ogd-smn_<abbr>_t_now.csv`
- Column used: `tre200s0` — air temperature 2 m, instantaneous.
- Station index: `.../ogd-smn_meta_stations.csv`

### Open-Meteo (anywhere, and fallback)

- Geocoding: `https://geocoding-api.open-meteo.com/v1/search?name=<q>&country=CH`
- Archive (ERA5, from 1940): `https://archive-api.open-meteo.com/v1/archive`
  with `daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min`
- Current: `https://api.open-meteo.com/v1/forecast` with `current=temperature_2m`
- No API key. ~9 km reanalysis grid, not a literal station reading.

Attribution required: **"Source: MeteoSwiss"** must be shown, plus Open-Meteo credit.

## Source tiering

Every place resolves to a **source plan** with two independent slots. The slots are never
silently mixed, and the UI always names the station and start year actually in use.

| Place | `live` slot | `history` slot |
|---|---|---|
| Basel (is an NBCN station) | SMN `BAS`, 10-min | NBCN `BAS`, from 1864 |
| Aarau (no NBCN station) | SMN `BUS` "Buchs / Aarau", ~4 km | Open-Meteo, from 1940 |
| Zermatt (neither) | Open-Meteo current | Open-Meteo, from 1940 |

Resolution algorithm:

1. **History slot:** exact NBCN station match (by name or abbreviation) → use NBCN.
   Otherwise → Open-Meteo archive from 1940.
2. **Live slot:** nearest SMN station within **15 km** → use it, and disclose the
   distance and altitude difference. Otherwise → Open-Meteo current.
3. If the place cannot be geocoded, show name suggestions rather than an empty chart.

The resolved plan carries a list of `caveats` (strings) which the UI renders verbatim in
a `SourceNote` component. Example caveat: *"Live value measured at Buchs / Aarau,
4 km away, 387 m."*

**Decision — no proxy series.** For a place without an NBCN station, we do *not*
substitute a distant long series (e.g. Zürich/Fluntern for Aarau). A 160-year record from
a different place at a different altitude would look more authoritative while being less
accurate. Accuracy over reach.

## The honest-comparison problem

A live instantaneous reading cannot be ranked against historical *daily means* — that is
a category error, and it is the single defect most likely to make this dashboard quietly
wrong.

Resolution: today's 10-minute SMN readings are aggregated into a **day-so-far** mean, max
and min. The selected metric is then compared against the *same* metric historically.
Because the day is incomplete, the comparison is explicitly marked provisional.

Headline card content:

```
Aarau · now 26.3 °C            (Buchs / Aarau, 14:20)
Day so far: max 27.1 °C, mean 21.4 °C · still in progress
4th-warmest July 30 of 86 years · +3.2 °C vs the 1991–2020 norm
Record 29.8 °C (1947) · Coldest 12.1 °C (1956)
```

Rules:

- Before midnight, `max` is a running maximum and `mean` is a partial-day mean. Both are
  labelled *"still in progress"*.
- Rank and percentile are computed against complete historical days only.
- When the selected date is **not** today, the live slot is hidden entirely and the card
  shows that date's finalised values.

## Data model

A build-time script condenses each NBCN station history into one packed JSON file.

```ts
type PackedStation = {
  abbr: string;          // "BAS"
  name: string;          // "Basel / Binningen"
  lat: number; lon: number; altitude: number;
  fromYear: number;      // 1864
  toYear: number;        // 2025
  mean: number[];        // Int16-valued, °C × 10
  max: number[];
  min: number[];
};

// index = (year - fromYear) * 366 + slotOfYear(month, day)
// value = temperature °C × 10;  MISSING = -32768
```

366 slots are reserved for every year, leap or not. This keeps indexing branch-free and
turns the dashboard's main query — *one calendar day across every year* — into a
fixed-stride walk (`stride = 366`) rather than a scan or a date parse per row.

`slotOfYear` must **not** use the true day-of-year, which shifts by one after February in
leap years and would make Mar 1 collide with Feb 29's slot. Instead it uses a fixed
leap-year month-offset table, so a calendar date maps to the same offset in *every* year:

```ts
// cumulative days before each month, as if every year were a leap year
const MONTH_OFFSET = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const slotOfYear = (month: number, day: number) => MONTH_OFFSET[month - 1] + (day - 1);
```

Consequences, which the tests pin down:

- Feb 29 is always slot 59, and is `MISSING` in non-leap years.
- Mar 1 is always slot 60, in leap and non-leap years alike.
- Slot 365 (Dec 31) is used in every year; no slot is wasted except Feb 29 in common years.

Sizes: ~200 KB gzipped per station, 29 stations. Written to
`public/data/nbcn/<ABBR>.json`, with `public/data/stations.json` as the combined index of
NBCN + SMN stations.

Current-year and live data are **not** prebuilt — they are fetched at runtime, since both
files are small (NBCN `_recent.csv` is ~210 rows; SMN `_t_now.csv` is one day of 10-minute
values).

## Modules

Pure logic is separated from all I/O so it is testable without network access.

**Pure:**

- `lib/packed.ts` — packed-array codec: `encode`, `decode`, `slotFor(date)`, `valueAt`.
- `lib/series.ts` — `dayAcrossYears(series, date, metric)` → points; plus `rank`,
  `percentile`, `normDeviation`, `trendSlope` (least-squares °C/century).
- `lib/resolvePlace.ts` — place + station indexes → `SourcePlan` with `caveats`.
- `lib/dayAggregate.ts` — 10-minute readings → day-so-far mean/max/min.

**I/O adapters** (all return the same `DaySeries` shape so the chart is source-agnostic):

- `lib/sources/nbcn.ts` — load packed station file + merge `_recent.csv`.
- `lib/sources/smn.ts` — parse `_t_now.csv` → latest reading + day-so-far.
- `lib/sources/openMeteo.ts` — geocode, archive, current.
- `lib/csv.ts` — shared `;`/latin-1/`DD.MM.YYYY` parsing.

**Components:**

- `PlacePicker` — name input with suggestions from the station index + geocoder.
- `DateControl` — defaults to today, scrubbable to any date.
- `MetricToggle` — mean / max / min.
- `CurrentReadingCard` — the headline card above.
- `DayAcrossYearsChart` — scatter of one point per year, today highlighted, trend line,
  record high/low marked.
- `SourceNote` — station names, year span, caveats, required attribution.

**Build script:** `scripts/build-data.ts` — fetch, condense, write `public/data/`.

## Stack

- Vite + React + TypeScript, deployed as static files.
- **Recharts** for the chart (scatter + reference line + highlighted point; 162 points is
  trivial). The `dataviz` skill governs the visual pass.
- **Vitest** for tests.

## Error handling

| Condition | Behaviour |
|---|---|
| min/max requested before 1897 | Chart shows the shorter available span with a note; no misleading gap. |
| Feb 29 selected | Renders the 40 available leap years, labelled as such. |
| Individual missing days in the record | Excluded from rank/percentile; count of available years always shown. |
| SMN `now` file stale or 404 | Fall back to Open-Meteo current, labelled as a different source. |
| Open-Meteo unreachable | NBCN history still renders; live slot degrades to unavailable. |
| Place not geocodable | Suggestion list, not an empty chart. |
| Selected date in the future | Rejected by `DateControl`. |

## Testing

Vitest, test-driven. Real fixtures are captured from the live APIs so the suite runs
offline:

- `ogd-nbcn_bas_d_historical.csv` (59 170 rows, 1864–2025)
- `ogd-nbcn_bas_d_recent.csv`
- `ogd-smn_bas_t_now.csv`
- both station metadata CSVs

Cases:

- Codec round-trip; `MISSING` sentinel preserved.
- Leap-year slot indexing — Mar 1 lands on slot 60 in both leap and non-leap years.
- `dayAcrossYears` for 30 July at Basel returns 162 years; hottest is 1947 at 26.8 °C.
- Rank/percentile correctness with gaps present.
- latin-1 decoding (station names such as "Château-d'Oex", "Grächen" survive intact).
- `DD.MM.YYYY` parsing.
- Source-plan resolution for Basel (NBCN+SMN), Aarau (SMN+Open-Meteo), Zermatt
  (Open-Meteo only).
- Day-so-far aggregation from 10-minute readings, including a partial day.

## Verified reference values

Useful as implementation assertions (Basel / Binningen, `ths200d0`):

- Daily series spans 1864-01-01 → 2025-12-31, 59 170 rows.
- 30 July appears in 162 years.
- Five hottest 30 Julys: 1947 (26.8), 2018 (26.4), 2024 (25.9), 1992 (25.6), 1911 (25.4).
- `ths200d0` coverage 100 %; `ths200dn`/`ths200dx` begin 1897 at 79 % coverage.
- Feb 29 present in 40 years.
- NBCN station count 29; SMN station count 158.
