// The May breeding survey (USFWS and Canadian Wildlife Service Waterfowl Breeding Population
// and Habitat Survey), traditional survey area: the "Total" rows of Tables 1-12 in USFWS,
// "Waterfowl Population Status, 2026". Thousands of birds (ponds: thousands of ponds).
// `ingest_population_status.py --dry-run` prints the same rows from the PDF; update both each
// September when the next report comes out.
//
// p and ltaP are the report's P values. Below 0.10 the report calls a change real ("11% below");
// at or above it the report says "similar", and so does the page.

export const BREEDING_YEAR = 2026
export const BREEDING_SOURCE_URL =
  'https://www.fws.gov/sites/default/files/documents/2026-09/waterfowl-population-status-report-2026.pdf'

export type BreedingRow = {
  /** Species slug on the Migration page's species filter, or a key for the summary rows */
  slug: string
  name: string
  now: number
  prev: number
  pct: number
  p: number
  lta: number
  ltaPct: number
  ltaP: number
}

export const BREEDING_TOTAL: BreedingRow =
  { slug: 'total', name: 'All ducks', now: 33439, prev: 33980, pct: -2, p: 0.547, lta: 35397, ltaPct: -6, ltaP: 0.002 }

export const BREEDING_PONDS: BreedingRow =
  { slug: 'ponds', name: 'May ponds', now: 4761, prev: 4180, pct: 14, p: 0.022, lta: 5207, ltaPct: -9, ltaP: 0.033 }

export const BREEDING_SPECIES: BreedingRow[] = [
  { slug: 'mallard', name: 'Mallard', now: 5859, prev: 6554, pct: -11, p: 0.048, lta: 7868, ltaPct: -26, ltaP: 0.001 },
  { slug: 'gadwall', name: 'Gadwall', now: 2351, prev: 2414, pct: -3, p: 0.721, lta: 2073, ltaPct: 13, ltaP: 0.036 },
  { slug: 'american-wigeon', name: 'American wigeon', now: 2940, prev: 3191, pct: -8, p: 0.474, lta: 2621, ltaPct: 12, ltaP: 0.149 },
  { slug: 'green-winged-teal', name: 'Green-winged teal', now: 2334, prev: 2550, pct: -8, p: 0.414, lta: 2201, ltaPct: 6, ltaP: 0.364 },
  { slug: 'blue-winged-teal', name: 'Blue-winged teal', now: 3962, prev: 4432, pct: -11, p: 0.144, lta: 5112, ltaPct: -22, ltaP: 0.001 },
  { slug: 'northern-shoveler', name: 'Northern shoveler', now: 3289, prev: 2758, pct: 19, p: 0.057, lta: 2649, ltaPct: 24, ltaP: 0.005 },
  { slug: 'pintail', name: 'Northern pintail', now: 1988, prev: 2239, pct: -11, p: 0.207, lta: 3791, ltaPct: -48, ltaP: 0.001 },
  { slug: 'redhead', name: 'Redhead', now: 931, prev: 918, pct: 1, p: 0.907, lta: 740, ltaPct: 26, ltaP: 0.013 },
  { slug: 'canvasback', name: 'Canvasback', now: 782, prev: 690, pct: 13, p: 0.32, lta: 593, ltaPct: 32, ltaP: 0.007 },
  { slug: 'scaup', name: 'Scaup', now: 4155, prev: 3675, pct: 13, p: 0.122, lta: 4896, ltaPct: -15, ltaP: 0.002 },
]

/** A change as the report words it: a real change in %, otherwise null ("similar") */
export function significantChange(pct: number, p: number): number | null {
  return p < 0.1 ? pct : null
}

/** 5,859 (thousands) -> "5.9M"; 931 -> "931K" */
export function formatThousands(k: number): string {
  return k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`
}
