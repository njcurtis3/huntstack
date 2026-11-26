/**
 * HuntStack's state registry (states.json), typed. Imported as `@huntstack/shared/states` so the
 * website gets only this file, not the Zod schemas in index.ts.
 *
 * No relative .ts imports in this file: in production the API runs it with Node's type stripping,
 * which needs explicit extensions that the API's tsc settings don't allow.
 */
import registry from './states.json' with { type: 'json' }

export type Flyway = 'central' | 'mississippi' | 'pacific' | 'atlantic'

export interface StateAgency {
  name: string
  url: string
  /** The agency's waterfowl page; null where only the home page is known */
  waterfowlUrl: string | null
}

export interface RegistryState {
  code: string
  name: string
  /** State guide URL: /duck-hunting/<slug> */
  slug: string
  /** In HuntStack: every "all states" default uses this */
  covered: boolean
  flyway: Flyway
  /** [lng, lat]: map markers, flow arrows, north-to-south order */
  center: [number, number]
  agency: StateAgency | null
  /** The statewide agency survey a state's Migration card waits on, and its own site name */
  statewideSurvey: { survey: string; site?: string } | null
  /** Counted only at survey sites (INHS flights, refuges); no statewide survey is loaded */
  siteCountsOnly: boolean
  /** Outfitter listings open in this state (a separate rollout) */
  outfitters: boolean
}

export const REGISTRY_STATES: readonly RegistryState[] = registry.states as RegistryState[]

/** Covered state codes, in registry order */
export const COVERED_STATES: readonly string[] = REGISTRY_STATES.filter(s => s.covered).map(s => s.code)

/** States open to outfitter listings */
export const OUTFITTER_STATES: readonly string[] = REGISTRY_STATES.filter(s => s.outfitters).map(s => s.code)

const BY_CODE = new Map(REGISTRY_STATES.map(s => [s.code, s]))

export function registryState(code: string): RegistryState | undefined {
  return BY_CODE.get(code.toUpperCase())
}

export function isCovered(code: string): boolean {
  return registryState(code)?.covered === true
}

/** Name of any registry state (covered or neighbour) */
export function registryStateName(code: string): string | undefined {
  return registryState(code)?.name
}

/** Flyway of each covered state */
export const COVERED_FLYWAY: Readonly<Record<string, Flyway>> = Object.fromEntries(
  REGISTRY_STATES.filter(s => s.covered).map(s => [s.code, s.flyway]),
)

/** Centre [lng, lat] of every registry state */
export const STATE_CENTERS: Readonly<Record<string, [number, number]>> = Object.fromEntries(
  REGISTRY_STATES.map(s => [s.code, s.center]),
)

/** Name of every registry state */
export const REGISTRY_STATE_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  REGISTRY_STATES.map(s => [s.code, s.name]),
)

/** Covered states' statewide surveys (the Migration cards and the weekly summary) */
export const STATEWIDE_SURVEY: Readonly<Record<string, { survey: string; site?: string }>> = Object.fromEntries(
  REGISTRY_STATES.filter(s => s.covered && s.statewideSurvey).map(s => [s.code, s.statewideSurvey!]),
)

/** Covered states counted only at survey sites */
export const SITE_COUNTS_ONLY: ReadonlySet<string> = new Set(
  REGISTRY_STATES.filter(s => s.covered && s.siteCountsOnly).map(s => s.code),
)

/** The agency page to send a hunter to for a state's waterfowl rules */
export function agencyWaterfowlPage(code: string): { name: string; url: string } | null {
  const a = registryState(code)?.agency
  return a ? { name: a.name, url: a.waterfowlUrl ?? a.url } : null
}
