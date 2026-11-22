"""
Build apps/api/src/data/river-gauges.ts: USGS stream gauges on the rivers in HuntStack's states,
with what their flow normally is through the year, for the Map's river layer.

Source: USGS Water Data (public domain):
  site list   https://waterservices.usgs.gov/nwis/site/  (active stream gauges with live discharge)
  statistics  https://waterservices.usgs.gov/nwis/stat/  (daily percentiles of mean daily flow
              over each gauge's whole record; asked for "all" statistics, since asking for
              p90 by name returns it blank)

Usage:
  python -I scripts/build-river-gauges.py            (fetches; a few minutes)

Kept: active stream gauges in TX NM AR LA KS OK MO IL IA that report discharge (parameter 00060),
drain at least MIN_DRAINAGE square miles (creeks are left out: they flash up and down with every
rain and say little about a river's bottoms), and have published p10/p25/p50/p75 percentiles
from at least MIN_YEARS years. p90 is kept where USGS publishes it.

The year is cut into 24 half-months (1st-15th, 16th-end of each month). Each half-month keeps the
median of USGS's daily percentile values in it, so the file stays small; the API compares the
latest flow with the half-month that holds today.
"""

import csv
import io
import json
import statistics
import sys
import time
import urllib.request

STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO', 'IL', 'IA']
MIN_DRAINAGE = 1000  # square miles
MIN_YEARS = 10
STATS_BATCH = 10
OUT = 'apps/api/src/data/river-gauges.ts'
UA = {'User-Agent': '(HuntStack data build, huntstack.net)'}
PCTS = ['p10', 'p25', 'p50', 'p75', 'p90']

SMALL = {'at', 'near', 'above', 'below', 'of', 'and', 'the', 'in', 'on', 'to', 'from', 'with'}
ABBREV = {'nr': 'near', 'abv': 'above', 'blw': 'below', 'bl': 'below', 'ab': 'above', 'cr': 'Creek', 'r': 'River',
          'rv': 'River', 'ck': 'Creek', 'trib': 'Tributary', 'res': 'Reservoir', 'lk': 'Lake', 'hwy': 'Hwy'}
STATE_WORDS = {'ill': 'IL', 'ark': 'AR', 'tex': 'TX', 'tx': 'TX', 'la': 'LA', 'ks': 'KS', 'kans': 'KS', 'ok': 'OK',
               'okla': 'OK', 'mo': 'MO', 'il': 'IL', 'ia': 'IA', 'iowa': 'IA', 'ar': 'AR', 'nm': 'NM', 'n': 'N', 'mex': 'Mex',
               'ky': 'KY', 'tn': 'TN', 'ms': 'MS', 'ne': 'NE', 'nebr': 'NE', 'co': 'CO', 'colo': 'CO', 'mn': 'MN', 'wi': 'WI'}


def get(url, tries=4):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read().decode('utf-8')
        except Exception as e:  # noqa: BLE001 - retry anything, then give up loudly
            if attempt == tries - 1:
                raise
            print(f'  retry ({e})', file=sys.stderr)
            time.sleep(5 * (attempt + 1))


def rdb(text):
    lines = [l for l in text.splitlines() if l and not l.startswith('#')]
    if len(lines) < 2:
        return []
    return list(csv.DictReader(io.StringIO('\n'.join([lines[0]] + lines[2:])), delimiter='\t'))


def tidy_name(name):
    """'EMBARRAS RIVER AT LAWRENCEVILLE, IL' -> 'Embarras River at Lawrenceville, IL'"""
    if name != name.upper():
        return ' '.join(name.split())
    words = name.replace(',', ' , ').replace('.', ' ').split()
    out = []
    after_comma = False
    for i, w in enumerate(words):
        lw = w.lower()
        if w == ',':
            out.append(',')
            after_comma = True
            continue
        if after_comma and lw in STATE_WORDS:
            out.append(STATE_WORDS[lw])
        elif lw in ABBREV:
            out.append(ABBREV[lw])
        elif i > 0 and lw in SMALL:
            out.append(lw)
        elif any(c.isdigit() for c in w):
            out.append(w)
        else:
            out.append(lw.capitalize())
    s = ' '.join(out).replace(' ,', ',')
    return s


def half_month(month, day):
    return (month - 1) * 2 + (0 if day <= 15 else 1)


def main():
    sites = {}
    for st in STATES:
        url = ('https://waterservices.usgs.gov/nwis/site/?format=rdb&siteOutput=expanded&siteStatus=active'
               f'&siteType=ST&hasDataTypeCd=iv&parameterCd=00060&stateCd={st.lower()}')
        rows = rdb(get(url))
        kept = 0
        for r in rows:
            try:
                da = float(r.get('drain_area_va') or 0)
                lat, lng = float(r['dec_lat_va']), float(r['dec_long_va'])
            except ValueError:
                continue
            if da < MIN_DRAINAGE or r['site_no'] in sites:
                continue
            sites[r['site_no']] = {'name': tidy_name(r['station_nm']), 'state': st, 'lat': round(lat, 4),
                                   'lng': round(lng, 4), 'drainage': round(da)}
            kept += 1
        print(f'{st}: {len(rows)} gauges, {kept} on rivers of {MIN_DRAINAGE}+ sq mi', file=sys.stderr)

    ids = sorted(sites)
    stats = {}
    for i in range(0, len(ids), STATS_BATCH):
        batch = ids[i:i + STATS_BATCH]
        url = ('https://waterservices.usgs.gov/nwis/stat/?format=rdb&statReportType=daily&parameterCd=00060'
               f'&statTypeCd=all&sites={",".join(batch)}')
        try:
            rows = rdb(get(url))
        except Exception as e:  # noqa: BLE001
            print(f'  stats failed for {batch}: {e}', file=sys.stderr)
            continue
        for r in rows:
            s = stats.setdefault(r['site_no'], {'years': 0, 'days': {}})
            try:
                s['years'] = max(s['years'], int(r.get('count_nu') or 0))
            except ValueError:
                pass
            vals = {}
            for p in PCTS:
                try:
                    vals[p] = float(r[f'{p}_va']) if r.get(f'{p}_va') else None
                except ValueError:
                    vals[p] = None
            k = half_month(int(r['month_nu']), int(r['day_nu']))
            s['days'].setdefault(k, []).append(vals)
        print(f'  stats {min(i + STATS_BATCH, len(ids))}/{len(ids)}', file=sys.stderr)
        time.sleep(0.5)

    out = []
    for sid in ids:
        s = stats.get(sid)
        if not s or s['years'] < MIN_YEARS:
            continue
        table = {p: [] for p in PCTS}
        ok = True
        for k in range(24):
            days = s['days'].get(k, [])
            for p in PCTS:
                v = [d[p] for d in days if d[p] is not None]
                if p != 'p90' and len(v) < max(1, len(days) // 2):
                    ok = False
                table[p].append(round(statistics.median(v), 1) if v else None)
        if not ok:
            continue
        # The percentiles must climb (USGS's rounding can tie them, never reverse them)
        if any(table['p10'][k] > table['p25'][k] or table['p25'][k] > table['p50'][k] or table['p50'][k] > table['p75'][k]
               for k in range(24)):
            continue
        if all(v is None for v in table['p90']):
            table['p90'] = None
        g = sites[sid]
        out.append([sid, g['name'], g['state'], g['lat'], g['lng'], g['drainage'], s['years'],
                    table['p10'], table['p25'], table['p50'], table['p75'], table['p90']])

    print(f'kept {len(out)} gauges with {MIN_YEARS}+ years of statistics', file=sys.stderr)
    body = ',\n'.join(json.dumps(g, separators=(',', ':')) for g in out)
    ts = f"""// GENERATED by scripts/build-river-gauges.py ({time.strftime('%Y-%m-%d')}). Do not edit by hand.
// USGS stream gauges (public domain) on rivers draining {MIN_DRAINAGE}+ sq mi in {' '.join(STATES)}, each with the
// median of USGS's daily flow percentiles (cubic feet per second) for each half-month of the year
// (index 0 = Jan 1-15, 1 = Jan 16-31, ... 23 = Dec 16-31). p90 is null where USGS publishes none.

type Pcts = Array<number | null>
/** [site number, name, state, lat, lng, drainage sq mi, years of record, p10, p25, p50, p75, p90 | null] */
export type RiverGaugeRow = [string, string, string, number, number, number, number, Pcts, Pcts, Pcts, Pcts, Pcts | null]

export const RIVER_GAUGES: RiverGaugeRow[] = [
{body},
]
"""
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(ts)
    print(f'wrote {OUT}', file=sys.stderr)


if __name__ == '__main__':
    main()
