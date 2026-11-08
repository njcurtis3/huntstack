import { describe, expect, it } from 'vitest'
import { createViewCounter, isCountableUserAgent } from './outfitter-views.js'
import { createMemoryOutfitterStore } from './outfitter-store.js'

const OUT = '44444444-4444-4444-8444-444444444444'
const OUT2 = '55555555-5555-4555-8555-555555555555'
const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130'

function setup(clock = new Date('2026-11-07T12:00:00Z')) {
  const store = createMemoryOutfitterStore()
  let now = clock
  const counter = createViewCounter({ store, now: () => now })
  return { store, counter, setNow: (d: Date) => { now = d } }
}

describe('outfitter view counting', () => {
  it('counts the same viewer, outfitter, kind and day once', async () => {
    const { store, counter } = setup()
    const viewer = { ip: '1.2.3.4', userAgent: UA }
    await counter.record(viewer, [{ outfitterId: OUT, kind: 'detail' }])
    await counter.record(viewer, [{ outfitterId: OUT, kind: 'detail' }])
    expect(store.state.views).toEqual([{ outfitterId: OUT, day: '2026-11-07', kind: 'detail', count: 1 }])
  })

  it('counts a different kind, outfitter, viewer or day separately', async () => {
    const { store, counter, setNow } = setup()
    const viewer = { ip: '1.2.3.4', userAgent: UA }
    await counter.record(viewer, [{ outfitterId: OUT, kind: 'detail' }, { outfitterId: OUT, kind: 'contact' }, { outfitterId: OUT2, kind: 'detail' }])
    await counter.record({ ip: '9.9.9.9', userAgent: UA }, [{ outfitterId: OUT, kind: 'detail' }])
    setNow(new Date('2026-11-08T01:00:00Z'))
    await counter.record(viewer, [{ outfitterId: OUT, kind: 'detail' }])
    const total = (o: string, kind: string) => store.state.views.filter(v => v.outfitterId === o && v.kind === kind).reduce((n, v) => n + v.count, 0)
    expect(total(OUT, 'detail')).toBe(3)
    expect(total(OUT, 'contact')).toBe(1)
    expect(total(OUT2, 'detail')).toBe(1)
    expect(store.state.views.map(v => v.day)).toContain('2026-11-08')
  })

  it('batches a list of impressions in one write', async () => {
    let writes = 0
    const store = createMemoryOutfitterStore()
    const original = store.addViews
    store.addViews = async (d) => { writes++; return original(d) }
    const counter = createViewCounter({ store, now: () => new Date('2026-11-07T12:00:00Z') })
    await counter.record({ ip: '1.1.1.1', userAgent: UA }, [{ outfitterId: OUT, kind: 'impression' }, { outfitterId: OUT2, kind: 'impression' }])
    expect(writes).toBe(1)
    expect(store.state.views).toHaveLength(2)
  })

  it.each([undefined, '', '   ', 'Googlebot/2.1', 'curl/8.4.0', 'python-requests/2.31', 'HeadlessChrome/120', 'Slackbot-LinkExpanding 1.0 preview', 'UptimeRobot monitor'])(
    'does not count user agent %j', async (ua) => {
      expect(isCountableUserAgent(ua)).toBe(false)
      const { store, counter } = setup()
      await counter.record({ ip: '1.2.3.4', userAgent: ua }, [{ outfitterId: OUT, kind: 'detail' }])
      expect(store.state.views).toHaveLength(0)
    })

  it('never stores anything identifying', async () => {
    const { store, counter } = setup()
    await counter.record({ ip: '203.0.113.7', userAgent: UA }, [{ outfitterId: OUT, kind: 'detail' }])
    const dump = JSON.stringify(store.state)
    expect(dump).not.toContain('203.0.113.7')
    expect(dump).not.toContain('Mozilla')
  })

  it('a failing write is logged and never thrown', async () => {
    const store = createMemoryOutfitterStore()
    store.addViews = async () => { throw new Error('db down') }
    const counter = createViewCounter({ store, now: () => new Date() })
    const logged: unknown[] = []
    await expect(counter.record({ ip: '1.1.1.1', userAgent: UA }, [{ outfitterId: OUT, kind: 'detail' }], { error: (e) => logged.push(e) })).resolves.toBeUndefined()
    expect(logged).toHaveLength(1)
  })
})
