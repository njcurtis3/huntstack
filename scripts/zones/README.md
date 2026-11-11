# Season zone shapes for the Map page

`apps/web/public/data/waterfowl-zones-2026.json` is built here. Each feature is one piece of a
state with one set of season zones. `duckUnits` and `gooseUnits` hold every `seasons.units`
value that applies there for each kind of bird, plus `"Statewide"` (they are the same list except
in Illinois, whose North duck and North goose lines differ). A duck zone and a goose zone that
overlap become one piece. The Map page shades each piece from the seasons whose units appear in
the list for the birds being shown.

```bash
cd scripts/zones
npm install              # @turf/turf only; this folder is not in the pnpm workspace
node fetch-sources.mjs   # downloads into .cache/ (gitignored); ONLY=ok- fetches just the road legs starting "ok-"
node build-zones.mjs     # writes apps/web/public/data/waterfowl-zones-2026.json
```

## Where each line comes from

| State | Zones | Source |
|---|---|---|
| TX | Duck: HPMMU, North, South. Goose: Eastern, Western | TPWD's own `Duck_Zones` and `Goose_Zones` ArcGIS layers, intersected |
| KS | High Plains, Low Plains Early, Late, Southeast (geese statewide) | KDWP's `Waterfowl_Zones` ArcGIS layer (updated Sept 2026) |
| OK | High Plains (Beaver, Cimarron, Texas counties), Low Plains Zone 1, Low Plains Zone 2 (geese statewide) | Census counties; the Zone 1/2 line is Census roads: OK 33, OK 47, US 183, I-40, US 177, OK 33, OK 18, OK 51, I-35, US 412, OK 132. Zones 1 and 2 share dates in 2026-27, so both pieces also carry "Zones 1 and 2" |
| NM | Central and Pacific Flyway portions, North and South zones, MRGV | USFWS flyway boundary layer (Continental Divide); I-40 from Arizona to Tucumcari, then US 54 to Texas (Census roads); MRGV = Valencia, Socorro and Sierra counties |
| LA | East and West | US 79 from Arkansas to LA 9, LA 9 to LA 147, LA 147 to US 167, US 167 to US 90 (on I-49 from Opelousas to Lafayette), US 90 to Mississippi (Census roads) |
| AR | Statewide | Census state outline. The 2026 memo allows a Northwest goose zone (22 counties), but AGFC's 2026-27 seasons are all statewide, so it isn't drawn |
| MO | North, Middle, South (geese the same) | MDC's `Hunting_Zones` layer. Its description still says 2021-25, but its North line is the 2026 one; the build also draws that line from Census roads and stops if the two differ by more than 200 km² |
| IL | Duck: North, Central, South. Goose: North (I-80 line), Central, South | Census roads, including the local roads the memo names (Peotone-Beecher, Wilmington-Peotone, New River, Pine Bluff-Lorenzo, St. Leo's, Modoc, Modoc Ferry, Levee roads, County Route 12) |
| IA | North, Central, South (geese the same) | Census I-29, US 20 and IA 92. South is everything west of I-29 below Sioux City plus everything south of IA 92 (Iowa DNR map book: "all areas west of I-29 and south of Highway 92") |

A state with zone shapes but no season rows is drawn as dashed outlines with a link to the
agency; once its rows exist it is shaded like the rest, with no code change. Season rows must use
these zone names in `seasons.units`: `North Zone`, `Middle Zone`, `South Zone` (MO); `North Zone`,
`Central Zone`, `South Zone` (IL ducks and geese, IA). `scripts/waterfowl-seasons-2026-27-mo-il-ia.sql`
(applied 2026-11-11) does.

The zone line text is from the 2026 MGBH authorization memo (MGBHM-2026-01), "Hunting Area
Descriptions". The highway lines are road centerlines joined end to end. They are approximate,
and the page says so.

## Each season

- If a state changes its zones, update `build-zones.mjs`. Then run the coverage check below.
  Every zone named in the season data must appear in some piece's `duckUnits` or `gooseUnits`.
- If the season data renames a zone, add the new name to the matching pieces' `units`.
- A new season year needs a new output file and a new `ZONE_URL` in `apps/web/src/pages/MapPage.tsx`.

Coverage check, against the running API:

```bash
node -e '
const z = require("../../apps/web/public/data/waterfowl-zones-2026.json");
(async () => { let bad = 0;
  for (const s of ["TX","KS","OK","NM","LA","AR","MO","IL","IA"]) {
    const have = new Set(z.features.filter(f => f.properties.state === s).flatMap(f => [...f.properties.duckUnits, ...f.properties.gooseUnits]));
    const j = await (await fetch(`http://localhost:4000/api/regulations/${s}/seasons?year=2026`)).json();
    for (const x of j.seasons) for (const u of x.units || []) if (!have.has(u)) { bad++; console.log("no shape:", s, u); }
  }
  console.log(bad ? `${bad} unmatched` : "every season zone has a shape");
})()'
```
