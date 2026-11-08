import { decodeJsonbField } from './jsonb.js'

/**
 * Whether a hunter can hunt waterfowl at a location, from locations.metadata:
 *   access      'public' | 'limited' | 'closed' | 'private' (missing = not checked yet)
 *   accessNote  one plain sentence, e.g. "Light geese only, in designated areas"
 *   accessSource the agency page the value came from
 *
 * Many survey sites are not hunting spots: private duck clubs counted from the air, and refuge
 * sanctuaries closed to waterfowl hunting. A count alone never makes a place huntable.
 */
export type Access = 'public' | 'limited' | 'closed' | 'private' | 'unknown'

const VALUES = new Set<Access>(['public', 'limited', 'closed', 'private'])

export interface AccessInfo {
  access: Access
  note: string | null
  source: string | null
}

export function accessOf(metadata: unknown): AccessInfo {
  const meta = decodeJsonbField<Record<string, unknown>>(metadata)
  const raw = meta?.access
  const access: Access = typeof raw === 'string' && VALUES.has(raw as Access) ? raw as Access : 'unknown'
  const note = typeof meta?.accessNote === 'string' && meta.accessNote ? meta.accessNote : null
  const source = typeof meta?.accessSource === 'string' && meta.accessSource ? meta.accessSource : null
  return { access, note, source }
}

/** Closed to waterfowl hunting, or private: left out of Where to Hunt unless asked for. */
export function isHuntable(access: Access): boolean {
  return access !== 'closed' && access !== 'private'
}

/** Plain words for the chat model and for logs. */
export function accessLabel(info: AccessInfo): string {
  const base = {
    public: 'open to public waterfowl hunting',
    limited: 'public waterfowl hunting only in part of the area or under limits',
    closed: 'closed to waterfowl hunting',
    private: 'private land, not open to the public',
    unknown: 'hunting access not verified by HuntStack',
  }[info.access]
  return info.note ? `${base} (${info.note})` : base
}
