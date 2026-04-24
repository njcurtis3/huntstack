# Migration Dashboard — Metric Calculation Reference

This document explains exactly how every metric on the Migration Dashboard is calculated. It is written for developers and technical stakeholders who need to understand or modify the underlying logic.

Last updated: 2026-04-22

---

## Data Sources

The dashboard draws from three independent data sources combined at query time:

| Source | Type | Freshness | Coverage |
|--------|------|-----------|----------|
| Refuge count surveys | Official biologist surveys (DB) | Updated weekly via Monday scraper | TX, NM, AR, LA, KS, OK, MO |
| NOAA Weather API | Live forecast data | 2-hour cache | All states |
| eBird (Cornell Lab) | Community bird observations | 3–6 hour cache | All states |

---

## 1. Refuge Counts

### What they are

Bird count surveys conducted by wildlife biologists at National Wildlife Refuges and state wildlife agencies. Stored in the `refuge_counts` table, joined to `locations` and `species`.

Statewide MWI (Midwinter Index) rows are excluded from all dashboard queries via:

```sql
WHERE l.name NOT LIKE '% - Statewide MWI'
```

### Current count + previous count

The dashboard fetches the two most recent surveys per refuge per species using a window function:

```sql
ROW_NUMBER() OVER (
  PARTITION BY rc.location_id, rc.species_id
  ORDER BY rc.survey_date DESC
) AS rn
```

- `rn = 1` = most recent survey (current count)
- `rn = 2` = second most recent survey (previous count)

These are self-joined to produce a single row with both values.

### Delta calculation

```
delta = currentCount - previousCount
deltaPercent = ((currentCount - previousCount) / previousCount) * 100
```

`deltaPercent` is rounded to one decimal place. If `previousCount` is zero, `deltaPercent` is `null` to avoid division by zero.

### Trend classification

| Condition | Trend label |
|-----------|-------------|
| No previous count exists | `new` |
| `abs(deltaPercent) < 5%` | `stable` |
| `delta > 0` and `abs(deltaPercent) >= 5%` | `increasing` |
| `delta < 0` and `abs(deltaPercent) >= 5%` | `decreasing` |

The 5% threshold prevents noise from small count variations being labeled as movement.

---

## 2. Push Factors

Push factors represent weather conditions known to trigger waterfowl movement south along the flyway. Calculated per state from NOAA forecast data.

### Data source

NOAA Weather API (no API key required). Two-step resolution:

1. `GET /points/{lat},{lng}` — resolves grid coordinates (WFO/x/y) for a given location
2. `GET /gridpoints/{wfo}/{x},{y}/forecast` — retrieves the standard (non-hourly) forecast

One representative refuge coordinate per state is used (first refuge alphabetically with a known `center_point`). Grid points are cached permanently; forecasts are cached for 2 hours.

### Three binary signals

Each state receives three binary checks:

#### 1. Cold Front Present

Compares the max temperature of forecast periods 1–2 against the min temperature of periods 3–4 (each period is ~12 hours):

```
coldFrontPresent = max(periods[0..1].temp) - min(periods[2..3].temp) >= 10°F
```

A >=10°F drop within the next two forecast periods indicates a front is currently passing through.

#### 2. Cold Front Incoming (48-hour)

Only evaluated if no front is currently present. Looks at the wider 8-period window:

```
coldFrontIncoming = max(periods[0..3].temp) - min(periods[4..7].temp) >= 10°F
```

This signals a front arriving within ~48 hours.

#### 3. North Wind

The current daytime forecast period's wind direction is checked against a fixed set:

```
NORTH_DIRECTIONS = { N, NW, NNW, NNE, NE }
```

North wind is a reliable indicator that birds are being pushed south ahead of or behind a front.

#### 4. Sub-freezing Temperature

```
subFreezing = current daytime temperature < 32°F
```

### Push score

Each true signal adds 1 point. Push score range: 0–3.

```
pushScore = (coldFrontPresent ? 1 : 0) + (northWind ? 1 : 0) + (subFreezing ? 1 : 0)
```

Note: `coldFrontIncoming` is reported separately but does NOT add to the push score — it is informational only.

### Overall push score

The dashboard reports the maximum push score across all states (not an average):

```
overallPushScore = max(pushScore for all states)
```

### Active alerts

NOAA active alerts are fetched per state and filtered to severity: `Extreme`, `Severe`, or `Moderate`. Up to 3 alerts are returned per state alongside the push score.

---

## 3. Flyway Progression

A time-series view of total bird counts aggregated by state and week, ordered north to south.

### Query logic

Counts are grouped by state and `DATE_TRUNC('week', survey_date)` — week boundaries are Monday 00:00 UTC. Statewide MWI rows are excluded.

Season window defaults to October 1 of the prior year through April 30 of the current year (e.g., 2025-10-01 to 2026-04-30 for the 2026 season). Up to 3 seasons can be requested via the `seasons` query parameter.

### North to South ordering

States are sorted by latitude, descending (northernmost first). Latitude is derived from:

1. `AVG(center_point->>'lat')` across all refuge rows returned for that state in the query
2. Falls back to a hardcoded state centroid table if no refuge coordinates are available

Hardcoded centroids used as fallback:

| State | Latitude |
|-------|----------|
| MO | 38.5 |
| KS | 38.7 |
| OK | 35.5 |
| AR | 34.8 |
| NM | 34.5 |
| TX | 31.5 |
| LA | 30.9 |

### Per-state output

Each state entry includes:

- `weeks[]` — array of `{ weekStart, totalCount }` across the season
- `peakWeek` — the week with the highest total count
- `peakCount` — that peak count value
- `latitude` — used for ordering only; not displayed

### Unified week axis

A union of all weeks observed across all states is returned as a shared `weeks[]` array. This allows the frontend to align state series on the same time axis even when survey dates vary.

---

## 4. Regional Activity (eBird)

Community bird observation data aggregated by state from eBird's regional API.

### Data source

eBird API v2, endpoint: `GET /data/obs/US-{STATE}/recent`

- Fetches 30 days of observations per state (`back=30`)
- Filtered client-side to 21 tracked waterfowl species via a hardcoded `EBIRD_SPECIES` code map (e.g., `mallar3` -> mallard, `snogoo` -> snow-goose)
- Presence-only records (null `howMany`) are excluded
- Cached per state for 3 hours

### Current vs. previous windows

Observations are split at the 14-day cutoff:

- **Current**: days 1–14 (most recent)
- **Previous**: days 15–30

Counts within each window are summed per species.

### Delta and trend

Same formula as refuge counts:

```
delta = currentCount - previousCount
deltaPercent = (delta / previousCount) * 100   [null if previousCount = 0]
trend = stable if abs(deltaPercent) < 5%, else increasing/decreasing
```

### Activity level thresholds

| Count (current window) | Activity level |
|------------------------|----------------|
| >= 5,000 | `high` |
| >= 500 | `moderate` |
| < 500 | `low` |

These thresholds apply to per-species counts within a state.

### State-level rollup

Per state, all species are summed to produce:

- `totalCurrentCount` — sum of all species current counts
- `totalPreviousCount` — sum of all species previous counts
- `overallDelta` and `overallDeltaPercent` — derived from totals
- `activityLevel` — `high` if any species is high, else `moderate` if any is moderate, else `low`
- `topSpecies[]` — top 3 species by current count

### Flyway rollup

States are grouped by flyway (Central or Mississippi) and totals are summed. Delta percent is calculated the same way.

---

## 5. Per-Refuge eBird Geo Query (Dashboard Overlay)

In addition to statewide regional data, the dashboard fetches eBird observations within a 25km radius of each known refuge coordinate.

### Query

eBird endpoint: `GET /data/obs/geo/recent`

Parameters:

- `lat`, `lng` — refuge center point
- `dist=25` — 25km radius
- `back=28` — 28 days (covers both current and previous windows in one call)
- `maxResults=2000`

Results filtered to `EBIRD_SPECIES` whitelist and `obsValid = true`. Records with `howMany = null` are excluded.

### Minimum count threshold

Species with fewer than 5 total observations in the current window are dropped (`MIN_COUNT = 5`) to filter incidental sightings.

### Output

Returns `EBirdCount[]` rows that match the shape of official refuge count rows. These are merged into `ebirdCounts[]` on the dashboard response alongside the official `currentCounts[]`, allowing the frontend to show eBird observations as a supplementary overlay on refuges.

Results are cached per coordinate (rounded to 2 decimal places) for 6 hours.

---

## 6. Weekly Intelligence Report

A 2–3 paragraph plain-prose narrative generated by the Together.ai LLM (`Qwen2.5-7B-Instruct-Turbo`).

### Input data assembled for the prompt

1. **Top 25 most recent refuge counts** (last 30 days, ranked by count descending) — includes refuge name, state, flyway, species, count, survey date, and survey-to-survey delta
2. **Push factors** for all states represented in those counts — cold front status, north wind, temperature, push score
3. **eBird statewide aggregates** for the same states — summed current vs. previous counts and trend direction

### Prompt instructions

The LLM is instructed to cover:

1. Where the highest concentrations are right now and whether numbers are building or declining
2. Notable spikes or drops at specific refuges
3. What weather/push factors mean for movement over the next few days

Output target: under 150 words, no markdown formatting, plain prose.

### Caching

Generated summaries are cached in-memory for 6 hours per `flyway + species` key combination. The `?refresh=true` query parameter bypasses the cache and forces regeneration.

---

## Caching Summary

| Data | TTL | Cache type |
|------|-----|------------|
| NOAA grid points | Permanent | In-memory Map |
| NOAA forecasts | 2 hours | In-memory Map |
| NOAA alerts | 30 minutes | In-memory Map |
| eBird per-refuge geo | 6 hours | In-memory Map |
| eBird regional (per state) | 3 hours | In-memory Map |
| Weekly LLM report | 6 hours | In-memory Map |

All caches are process-scoped — they reset on API restart. There is no Redis or persistent cache layer in V1.
