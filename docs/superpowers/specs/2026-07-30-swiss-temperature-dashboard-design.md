# Swiss Temperature Dashboard — Design

**Date:** 2026-07-30
**Status:** Approved

## Purpose

A dashboard that answers one question well: **is today's temperature unusual for this date, here?**

Pick any of 149 official MeteoSwiss stations, see the current measured temperature, and
compare it against every recorded value for that same calendar day — back to 1864 where
the record allows, and back to the station's first reading everywhere else.

## Scope

In scope:

- Place selection by name across **149 official MeteoSwiss stations**, plus any other Swiss
  place via geocoding.
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
- **All 29 are a strict subset of the 149 SMN stations**, so NBCN adds no new places —
  it adds *homogenised* (break-corrected) series for 29 of them.
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

### SMN — automatic weather stations (live *and* measured daily history)

- Collection: `ch.meteoschweiz.ogd-smn`
- **149 active stations** carry daily temperature; this is the backbone of station coverage.
- Assets per station (`<abbr>` lowercased in the path, uppercased in the filename):
  - `ogd-smn_<abbr>_t_now.csv` — 10-minute values, refreshed every 10–20 min. **Live.**
  - `ogd-smn_<abbr>_d_historical.csv` — daily values to 2025-12-31. **Measured history.**
  - `ogd-smn_<abbr>_d_recent.csv` — daily values for the current year.
- Columns used:
  - `tre200s0` — air temperature 2 m, instantaneous (10-minute files)
  - `tre200d0` / `tre200dx` / `tre200dn` — daily mean / max / min
- Station index: `.../ogd-smn_meta_stations.csv`
- **Authoritative coverage per station+parameter:** `.../ogd-smn_meta_datainventory.csv`
  (columns `station_abbr, parameter_shortname, data_since, data_till`).

**`station_data_since` in the station index is not the daily file's coverage** and must not
be used for it. Buchs / Aarau reports `station_data_since = 1959` but its daily
temperature series begins 1984-05-23. The build script reads coverage from
`ogd-smn_meta_datainventory.csv`, filtered to `parameter_shortname = tre200d0` with an
empty `data_till` (i.e. still active).

History depth across the 149 stations (`tre200d0` start year):

| Starts | Stations |
|---|---|
| before 1900 | 22 |
| 1900–1959 | 34 |
| 1960–1979 | 22 |
| 1980–1999 | 37 |
| 2000 or later | 34 |

62 stations have ≥60 years; 90 have ≥40 years. Longest non-NBCN record: Schaffhausen
(`SHA`) from 1863.

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

**History slot**, in priority order:

1. **NBCN homogenised** — if the station is one of the 29. Break-corrected, from 1864.
2. **SMN measured daily** — any of the 149 stations. Real readings, station-dependent start.
3. **Open-Meteo archive** — only when no station lies within 15 km. Reanalysis, from 1940.

**Live slot**, in priority order:

1. **Nearest SMN station within 15 km** — disclose its name, distance and altitude delta.
2. **Open-Meteo current** — labelled as a different kind of source.

Worked examples:

| Place | `live` slot | `history` slot | Years |
|---|---|---|---|
| Basel | SMN `BAS` | NBCN `BAS` homogenised | 1864+ |
| Aarau | SMN `BUS` "Buchs / Aarau", 2.8 km | SMN `BUS` measured | 1984+ (42 yrs) |
| Schaffhausen | SMN `SHA` | SMN `SHA` measured | 1863+ |
| Zermatt | Open-Meteo current | Open-Meteo archive | 1940+ |

If a place cannot be geocoded, show name suggestions rather than an empty chart.

The resolved plan carries a list of `caveats` (strings) which the UI renders verbatim in a
`SourceNote` component — e.g. *"Measured at Buchs / Aarau, 2.8 km away, 387 m."*

### Decision — no proxy series

For a place with no nearby station we do **not** substitute a distant long series (e.g.
Zürich/Fluntern for Aarau). A 160-year record from a different place at a different
altitude looks more authoritative while being less accurate. Accuracy over reach.

### Decision — homogenised beats measured where both exist

For the 29 NBCN stations both a homogenised and a raw measured series exist. The
homogenised one wins, because it is corrected for station relocations and instrument
changes, which is exactly what makes a multi-decade trend line trustworthy.

The consequence must be disclosed: **for the 120 SMN-only stations the trend line is
computed on raw, non-homogenised data**, so part of any apparent trend may be an artifact
of station changes rather than climate. `SourceNote` states this whenever the history slot
is SMN. The trend line is still shown — it is informative — but it is labelled
*"raw series, not homogenised"* rather than presented as a climate finding.

### Decision — no reanalysis backfill of short records

A station starting in 2005 could be extended to 1940 with Open-Meteo. We do not do this:
splicing reanalysis onto measurements creates a discontinuity at the join that reads as a
real climate signal. Short records stay short and say so.

## The honest-comparison problem

A live instantaneous reading cannot be ranked against historical *daily means* — that is
a category error, and it is the single defect most likely to make this dashboard quietly
wrong.

Resolution: today's 10-minute SMN readings are aggregated into a **day-so-far** mean, max
and min. The selected metric is then compared against the *same* metric historically.
Because the day is incomplete, the comparison is explicitly marked provisional.

Headline card content:

Illustrative layout (the live figures are invented; only the 2018 record and the 42-year
count are real):

```
Aarau · now 26.3 °C            (Buchs / Aarau, 2.8 km, 14:20)
Day so far: max 27.1 °C, mean 21.4 °C · still in progress
8th-warmest July 30 of 42 years · +1.4 °C vs the 1991–2020 norm
Record max 34.1 °C (2018) · Lowest max 17.3 °C (1987)
```

The norm deviation comes from `th9120dv` for NBCN stations. For SMN stations that column
does not exist, so it is computed from the station's own 1991–2020 values for that
calendar day — and suppressed entirely if the station has fewer than 20 of those 30 years.

Rules:

- Before midnight, `max` is a running maximum and `mean` is a partial-day mean. Both are
  labelled *"still in progress"*.
- Rank and percentile are computed against complete historical days only.
- When the selected date is **not** today, the live slot is hidden entirely and the card
  shows that date's finalised values.

## Data model

A build-time script condenses each station's history into one packed JSON file.

```ts
type PackedStation = {
  abbr: string;          // "BAS"
  name: string;          // "Basel / Binningen"
  lat: number; lon: number; altitude: number;
  source: 'nbcn' | 'smn';  // which tier this file was built from
  homogenised: boolean;    // true only for the 29 NBCN stations
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

### Build script and payload

`scripts/build-data.ts` builds all **149** stations:

- Reads `ogd-smn_meta_stations.csv` + `ogd-smn_meta_datainventory.csv` to determine the
  station set and each station's true `tre200d0` coverage.
- For the 29 NBCN stations, fetches `ogd-nbcn_<abbr>_d_historical.csv`; for the other 120,
  fetches `ogd-smn_<abbr>_d_historical.csv`.
- Writes `public/data/stations/<ABBR>.json` plus `public/data/stations.json` (the index:
  abbr, name, canton, lat/lon, altitude, fromYear, source, homogenised).

Practical constraints, because this is now ~340 MB of upstream CSV rather than ~78 MB:

- **Concurrency capped at 8** parallel fetches — be a good citizen of a public federal API.
- **Local disk cache** of raw CSVs (gitignored) keyed by URL, so re-runs during development
  don't refetch. `--force` bypasses it.
- **Per-station failure is non-fatal**: log it, skip that station, continue. A single 404
  must not fail the whole build. The build prints a summary of skipped stations and exits
  non-zero only if more than 10 % failed.

Sizes: ~50 KB gzipped for a 40-year station, ~200 KB for a 160-year one; roughly 15 MB
total across 149 stations. The **client fetches only the selected station's file**, so a
page view costs one small request regardless of the total.

Current-year and live data are **not** prebuilt — they are fetched at runtime, since both
files are small (`_d_recent.csv` is ~210 rows; `_t_now.csv` is one day of 10-minute values).
This also means the deployed site stays correct as the year progresses without a rebuild;
only the pre-2026 history needs periodic rebuilding.

## Modules

Pure logic is separated from all I/O so it is testable without network access.

**Pure:**

- `lib/packed.ts` — packed-array codec: `encode`, `decode`, `slotFor(date)`, `valueAt`.
- `lib/series.ts` — `dayAcrossYears(series, date, metric)` → points; plus `rank`,
  `percentile`, `normDeviation`, `trendSlope` (least-squares °C/century).
- `lib/resolvePlace.ts` — place + station indexes → `SourcePlan` with `caveats`.
- `lib/dayAggregate.ts` — 10-minute readings → day-so-far mean/max/min.

**I/O adapters** (all return the same `DaySeries` shape so the chart is source-agnostic):

- `lib/sources/packed.ts` — load `public/data/stations/<ABBR>.json` (works for either tier,
  since the build already normalised them).
- `lib/sources/dailyRecent.ts` — fetch + parse the current-year `_d_recent.csv` for either
  collection and merge it onto the packed series.
- `lib/sources/smnLive.ts` — parse `_t_now.csv` → latest reading + day-so-far.
- `lib/sources/openMeteo.ts` — geocode, archive, current.
- `lib/csv.ts` — shared `;`/latin-1/`DD.MM.YYYY` parsing.

Note that NBCN and SMN differ only in collection id, path and column names
(`ths200*` vs `tre200*`). One parameterised daily-CSV reader handles both rather than two
near-duplicate adapters.

**Components:**

- `PlacePicker` — searches the 149-station index by station name, canton and abbreviation,
  falling back to the Open-Meteo geocoder for places with no nearby station. Results show
  altitude and the available year span so the choice is informed.
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
| NBCN min/max requested before 1897 | Chart shows the shorter available span with a note; no misleading gap. |
| Station with a short record (e.g. from 2010) | Renders the few years it has, states the count, and **suppresses the trend line below 30 years** — a slope fitted to 15 noisy single days is meaningless. |
| Norm deviation on a station lacking 1991–2020 cover | Suppressed if fewer than 20 of those 30 years are present. |
| Feb 29 selected | Renders only the leap years available at that station, labelled as such. |
| Individual missing days in the record | Excluded from rank/percentile; count of available years always shown. |
| SMN `now` file stale or 404 | Fall back to Open-Meteo current, labelled as a different source. A `now` file older than 2 h counts as stale. |
| Open-Meteo unreachable | Station history still renders; live slot degrades to unavailable. |
| Station's packed file missing (build skipped it) | Station is absent from `stations.json`, so it is never offered. |
| Place not geocodable | Suggestion list, not an empty chart. |
| Selected date in the future | Rejected by `DateControl`. |

## Testing

Vitest, test-driven. Real fixtures are captured from the live APIs so the suite runs
offline:

- `ogd-nbcn_bas_d_historical.csv` (59 170 rows, 1864–2025) — long homogenised series
- `ogd-nbcn_bas_d_recent.csv`
- `ogd-smn_bus_d_historical.csv` (15 200 rows, 1984–2025) — short measured series
- `ogd-smn_bas_t_now.csv` — 10-minute live
- `ogd-smn_meta_stations.csv`, `ogd-smn_meta_datainventory.csv`, `ogd-nbcn_meta_stations.csv`

Cases:

- Codec round-trip; `MISSING` sentinel preserved.
- Leap-year slot indexing — Mar 1 lands on slot 60 in both leap and non-leap years.
- `dayAcrossYears` for 30 July at Basel returns 162 years; hottest is 1947 at 26.8 °C.
- `dayAcrossYears` for 30 July at Buchs/Aarau returns 42 years; hottest mean is 2024 at
  24.3 °C, hottest max is 2018 at 34.1 °C.
- Both column families parse through one reader: `ths200d0` (NBCN) and `tre200d0` (SMN).
- Coverage is read from `datainventory`, **not** `station_data_since` — regression test:
  `BUS` resolves to 1984, not 1959.
- Rank/percentile correctness with gaps present.
- Trend line suppressed for a series under 30 years.
- latin-1 decoding (station names such as "Château-d'Oex", "Grächen" survive intact).
- `DD.MM.YYYY` parsing.
- Source-plan resolution for Basel (NBCN homogenised), Aarau (SMN measured), Zermatt
  (Open-Meteo only).
- Day-so-far aggregation from 10-minute readings, including a partial day.

## Verified reference values

All confirmed against the live APIs on 2026-07-30.

**Basel / Binningen — NBCN homogenised, `ths200d0`:**

- Daily series spans 1864-01-01 → 2025-12-31, 59 170 rows.
- 30 July appears in 162 years.
- Five hottest 30 Julys: 1947 (26.8), 2018 (26.4), 2024 (25.9), 1992 (25.6), 1911 (25.4).
- `ths200d0` coverage 100 %; `ths200dn`/`ths200dx` begin 1897 at 79 % coverage.
- Feb 29 present in 40 years.

**Buchs / Aarau — SMN measured, `tre200d0`:**

- Daily series spans 1984-05-22 → 2025-12-31, 15 200 rows.
- 30 July appears in 42 years (1984–2025).
- Three hottest 30 Julys by mean: 2024 (24.3), 1992 (24.0), 2018 (24.0).
- Three hottest by max: 2018 (34.1), 2024 (33.5), 1992 (32.7).
- `datainventory` gives `tre200d0` from 23.05.1984, while `station_data_since` says 1959.

**Station counts:**

- NBCN collection: 29 stations, a strict subset of SMN.
- SMN collection: 158 stations, of which **149 have active daily temperature**.
- Longest non-homogenised record: Schaffhausen (`SHA`) from 1863.
