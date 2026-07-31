# Swiss Temperature Dashboard

Pick one of 149 official MeteoSwiss stations and see today's temperature ranked against
every recorded value for that same calendar day — back to 1864 at the longest stations.

## Running it

```bash
npm install
npm run build:data   # first run only — see the warning below
npm run dev
```

**`build:data` downloads roughly 340 MB** of MeteoSwiss CSV across 149 stations at a
concurrency of 8, and takes several minutes. It caches raw downloads under `.cache/`, so
re-runs are near-instant; pass `--force` to refetch. It writes **72.8 MB** into
`public/data/` (gitignored).

Re-run it periodically to pick up completed years. The current year and all live values are
fetched in the browser, so the deployed site stays correct between rebuilds.

```bash
npm test          # 208 tests, no network required
npm run build     # tsc --noEmit && vite build
npm run preview
```

Deployment must run `build:data` before `build`, since `public/data/` is not committed.

### Cache headers on deploy

Everything under `/data/` is immutable between `build:data` runs, so serve it with a long
`Cache-Control` (e.g. `max-age=86400`). The app also keeps loaded station files in memory
for the session, so switching between two stations re-fetches neither. The live MeteoSwiss
files are fetched fresh on every station selection by design — that is the "actual
temperature" half of the dashboard, and MeteoSwiss sends its own `max-age=10`.

## Data sources

| Tier | Collection | Stations | From | Kind |
|---|---|---|---|---|
| Homogenised daily | `ch.meteoschweiz.ogd-nbcn` | 29 | 1864 | break-corrected |
| Measured daily | `ch.meteoschweiz.ogd-smn` | 149 | station-dependent | raw measurements |
| Live 10-minute | `ch.meteoschweiz.ogd-smn` | 149 | today | raw measurements |
| Reanalysis fallback | Open-Meteo ERA5 | anywhere | 1940 | ~9 km model grid |

All 29 NBCN stations are a subset of the 149 SMN stations — NBCN adds *homogenised* series
for 29 of them, not new places. History depth as actually built: **39** stations start
before 1900, **88** have at least 60 years, **121** have at least 40. The earliest series
begins in **1863** (Schaffhausen, which is also the longest non-homogenised record).

Both MeteoSwiss and Open-Meteo send permissive CORS headers, so the browser fetches them
directly and there is no backend.

Source: MeteoSwiss. Weather data by Open-Meteo.com.

## Two upstream details that will bite you

**Timestamps are UTC.** MeteoSwiss publishes all reference timestamps in UTC. Treating them
as local Swiss time adds a false 1 h (CET) or 2 h (CEST) to a reading's apparent age — which
in summer exceeds the 2 h staleness threshold and suppresses the live reading permanently.
`isStale` compares absolute instants; display goes through `Intl` with `Europe/Zurich`.
Never hardcode an offset: it changes with DST.

**`station_data_since` is not the series coverage.** It records when the *station* was
founded, which can be decades before temperature recording began — Buchs / Aarau reports
1959, but its daily temperature series starts 1984-05-23. Coverage must be read from
`ogd-smn_meta_datainventory.csv`, filtered to `parameter_shortname = tre200d0` with an empty
`data_till`.

## How the comparison stays honest

The core risk in this dashboard is comparing things that aren't comparable. Four rules
guard against it:

- **Same metric, same day.** Today's 10-minute readings are aggregated into a day-so-far
  mean/max/min and compared against the *same* metric historically — never an instantaneous
  reading against historical daily means. An unfinished day is labelled "still in progress".
- **Local calendar day.** The live file holds a UTC day, so readings are filtered to the
  Europe/Zurich calendar day before aggregating. Without this, for about two hours after
  local midnight the app would label the previous day's full aggregate as today — and did,
  briefly claiming an all-time record built from the day before.
- **No splicing.** For a place with no station within 15 km, the Open-Meteo series *replaces*
  the station series wholesale. Reanalysis is never appended to measurements: the join
  discontinuity would read as a real climate signal.
- **Averaging is not mixed with a partial day.** With a ±3 or ±7 day window the historical
  points are averages, but today's unfinished day cannot be averaged the same way — there
  are no future days. A single unsmoothed day scored against a smoothed, narrower
  distribution ranks systematically too high, so today's rank is withheld while a window is
  active. The reading itself is still shown, and a past date still ranks normally because
  its value comes from the same smoothed series.
- **Trends are labelled.** Suppressed below 30 years of record, and marked *"raw series, not
  homogenised"* for the 120 stations outside the NBCN network, where part of an apparent
  trend may be an artifact of station relocations rather than climate.

Norm deviation is suppressed unless at least 20 of the 30 years 1991–2020 are present.

## Two views

**This day** — one dot per year for a single calendar date, with a trend line. Answers
"is today unusual for this date".

**Whole year** — the selected year's daily curve over the historical envelope: the full
recorded range shaded lightly, the middle 80 % of years darker, and the day-by-day average
as a thin line. Answers "how has this year run against the record". Both read the same
packed arrays — the day view walks one slot across years, the year view walks all slots
within a year.

The year view also tallies the year so far, e.g. *"211 days recorded · 72 above the usual
range, 3 below · 12 at an all-time high"*. The selected year is included in its own
envelope: excluding it would overstate how exceptional it looks.

## Shareable links

State lives in the query string, so any view can be linked:

    ?station=BUS&date=2024-02-29&metric=max&window=7&view=year

Every parameter is validated independently, and anything that does not parse is dropped
rather than defaulted — a truncated or hand-edited link restores the parts that survived
instead of failing whole, and the address bar then self-heals to the state actually applied.
Defaults are omitted, so a plain view stays `?station=SMA`.

This is why `isIsoDate` validates the calendar and not just the shape: the date input was
once the only writer of date state and could never produce an impossible date, but a link
can.

## Architecture

`scripts/build-data.ts` condenses each station's daily history into packed integer arrays —
366 slots per year whether or not it is a leap year, values as °C × 10, `-32768` for
missing. The fixed stride makes the dashboard's main query ("this day across every year") a
strided walk rather than a scan, and keeps a calendar date on the same offset in every year.
A true day-of-year would shift dates after February in leap years and collide Mar 1 with
Feb 29.

Pure functions in `src/lib` do all parsing and statistics and are tested against real
captured MeteoSwiss fixtures. `src/lib/sources` holds the only code that touches the
network; every fetch takes an injectable `fetchImpl` so tests never hit it.

Payload: `stations.json` is 4 KB gzipped, and a station file is 58 KB (42 years) to 205 KB
(162 years) gzipped. The client fetches only the selected station, so a page view costs the
index plus one station file regardless of the 72.8 MB total on disk.

## Tests

```bash
npm test
```

208 tests, fully offline. Fixtures in `tests/fixtures/` are trimmed real MeteoSwiss CSVs
(~15 KB each, preserving every asserted reference value); regenerate with
`npm run capture:fixtures`.

Assertions use real verified values rather than invented ones — Basel's 30 July series is
162 years with a +2.57 °C/century trend and a 1947 record of 26.8 °C; Buchs / Aarau's is
42 years from 1984 with a 2018 max of 34.1 °C.

## Known limitations

- The JS bundle is 545 KB (159 KB gzipped), most of it Recharts. Code-splitting would help
  if that matters.
- Only temperature. Precipitation and sunshine sit in the same CSVs and would need little
  new plumbing.
- Component tests cover the three honesty-critical surfaces (tooltip, reading card, source
  note) but not the full app wiring; `App.tsx` is exercised by hand in the browser.
