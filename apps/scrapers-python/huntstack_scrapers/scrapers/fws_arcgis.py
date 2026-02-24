"""
ArcGIS REST API discovery and fetch utilities for HuntStack.

Phase 5 of the scraper migration plan:
- Probe state agency ArcGIS endpoints to see what's available as structured JSON
- Check FWS ArcGIS for refuge boundaries and waterfowl data
- Check migbirdapps.fws.gov for downloadable MWI / harvest datasets

Run the discovery script:
    python -m huntstack_scrapers.scrapers.fws_arcgis

Update migration_status.json with results:
  - Sources that return structured JSON get status="eliminated_by_api"
  - Sources that need HTML/PDF scraping stay as-is
"""

import asyncio
import json
import sys
import httpx
from typing import Optional

# ─── FWS ArcGIS ──────────────────────────────────────────────────────────────

# Main FWS ArcGIS REST root — probe this for available services
FWS_ARCGIS_ROOTS = [
    "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services",
    "https://gis.fws.gov/arcgis/rest/services",
]

# FWS Migratory Bird Apps — check for downloadable datasets
FWS_MIGBIRD_URLS = [
    "https://migbirdapps.fws.gov",
    "https://migbirdapps.fws.gov/mbdc/db/dataset",
]

# ─── State agency ArcGIS endpoints to probe ──────────────────────────────────

STATE_ARCGIS_ENDPOINTS = {
    "TX": [
        "https://tpwd.texas.gov/arcgis/rest/services",
        "https://gis.tpwd.texas.gov/arcgis/rest/services",
    ],
    "AR": [
        "https://gis.agfc.com/arcgis/rest/services",
        "https://agfc.com/arcgis/rest/services",
    ],
    "NM": [
        "https://wildlife.dgf.nm.gov/arcgis/rest/services",
        "https://gis.nm.gov/arcgis/rest/services",
        "https://rgis.unm.edu/arcgis/rest/services",
    ],
    "LA": [
        "https://gis.wlf.louisiana.gov/arcgis/rest/services",
        "https://www.wlf.louisiana.gov/arcgis/rest/services",
    ],
    "KS": [
        "https://gis.ksoutdoors.gov/arcgis/rest/services",
        "https://ksoutdoors.gov/arcgis/rest/services",
    ],
    "OK": [
        "https://gis.wildlifedepartment.com/arcgis/rest/services",
        "https://www.wildlifedepartment.com/arcgis/rest/services",
    ],
    "MO": [
        "https://gis.mdc.mo.gov/arcgis/rest/services",
        "https://mdc.mo.gov/arcgis/rest/services",
    ],
}


async def probe_endpoint(client: httpx.AsyncClient, url: str) -> Optional[dict]:
    """
    Check if an ArcGIS REST endpoint exists and return its service catalogue.
    Returns None if unreachable or not an ArcGIS endpoint.
    """
    try:
        probe_url = url if "?" in url else f"{url}?f=json"
        response = await client.get(probe_url, timeout=10.0, follow_redirects=True)
        if response.status_code == 200:
            data = response.json()
            # ArcGIS REST returns a "currentVersion" or "services" key
            if "currentVersion" in data or "services" in data or "folders" in data:
                return data
        return None
    except Exception:
        return None


async def probe_url_exists(client: httpx.AsyncClient, url: str) -> tuple[str, int]:
    """Check if a URL returns 200."""
    try:
        response = await client.head(url, timeout=10.0, follow_redirects=True)
        return url, response.status_code
    except Exception:
        return url, 0


async def discover_all():
    """
    Run all ArcGIS probes and print a summary.
    Updates migration_status.json if ArcGIS sources are found.
    """
    results = {}

    async with httpx.AsyncClient(
        headers={"User-Agent": "HuntStack/1.0 (migration audit; contact: huntstack.io)"},
        timeout=15.0,
    ) as client:

        # ── FWS ArcGIS roots ──
        print("=" * 60)
        print("FWS ArcGIS Endpoints")
        print("=" * 60)
        for url in FWS_ARCGIS_ROOTS:
            data = await probe_endpoint(client, url)
            if data:
                services = data.get("services", [])
                folders = data.get("folders", [])
                print(f"\n[LIVE] {url}")
                print(f"   Version: {data.get('currentVersion', 'unknown')}")
                print(f"   Folders: {folders[:10]}")
                print(f"   Services ({len(services)} total):")
                for svc in services[:15]:
                    print(f"     - {svc.get('name')} ({svc.get('type')})")
                results[f"fws_{url.split('/')[2]}"] = {
                    "url": url,
                    "live": True,
                    "service_count": len(services),
                    "folders": folders,
                    "services_preview": [s.get("name") for s in services[:10]],
                }
            else:
                print(f"[DEAD] {url}")
                results[f"fws_{url.split('/')[2]}"] = {"url": url, "live": False}

        # ── FWS MigBird Apps ──
        print("\n" + "=" * 60)
        print("FWS MigBird Apps (harvest / survey datasets)")
        print("=" * 60)
        for url in FWS_MIGBIRD_URLS:
            _, status = await probe_url_exists(client, url)
            if status == 200:
                print(f"[LIVE] ({status}): {url}")
            else:
                print(f"[DEAD] ({status}): {url}")

        # ── State agency ArcGIS ──
        print("\n" + "=" * 60)
        print("State Agency ArcGIS Endpoints")
        print("=" * 60)
        for state, urls in STATE_ARCGIS_ENDPOINTS.items():
            print(f"\n-- {state} --")
            found = False
            for url in urls:
                data = await probe_endpoint(client, url)
                if data:
                    services = data.get("services", [])
                    print(f"  [LIVE] {url}")
                    print(f"     Services ({len(services)} total):")
                    for svc in services[:8]:
                        print(f"       - {svc.get('name')} ({svc.get('type')})")
                    results[state] = {
                        "url": url,
                        "live": True,
                        "service_count": len(services),
                        "services_preview": [s.get("name") for s in services[:8]],
                    }
                    found = True
                    break
                else:
                    print(f"  [DEAD] {url}")
            if not found:
                results[state] = {"live": False, "urls_tried": urls}

    # ── Summary ──
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    live_states = [s for s, r in results.items() if r.get("live")]
    dead_states = [s for s, r in results.items() if not r.get("live")]
    print(f"Live ArcGIS endpoints: {live_states}")
    print(f"No ArcGIS found:       {dead_states}")
    print()
    print("Next steps:")
    for state in live_states:
        r = results[state]
        print(f"  {state}: Inspect services at {r.get('url')} — look for regulation or survey layers")
    for state in dead_states:
        print(f"  {state}: No ArcGIS — use Scrapling + LLM extraction")

    # Write results to file for reference
    output_path = "arcgis_discovery_results.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results written to: {output_path}")


async def fetch_arcgis_layer(
    service_url: str,
    layer_id: int = 0,
    where: str = "1=1",
    out_fields: str = "*",
    max_records: int = 2000,
) -> list[dict]:
    """
    Generic ArcGIS FeatureServer query.

    Usage:
        records = await fetch_arcgis_layer(
            "https://services.arcgis.com/.../FeatureServer",
            layer_id=0,
            where="STATE_CODE='TX'",
        )
    """
    url = f"{service_url}/{layer_id}/query"
    params = {
        "where": where,
        "outFields": out_fields,
        "f": "json",
        "resultRecordCount": max_records,
        "returnGeometry": "false",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

    if "error" in data:
        raise RuntimeError(f"ArcGIS error: {data['error']}")

    features = data.get("features", [])
    return [f["attributes"] for f in features]


if __name__ == "__main__":
    asyncio.run(discover_all())
