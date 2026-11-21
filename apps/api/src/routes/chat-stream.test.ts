import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountStore } from '../lib/account-store.js'
import { visitorId } from '../lib/secret-box.js'

// No database in tests: every query finds nothing, so the answer comes from the (fake) model alone
vi.mock('../lib/db.js', () => ({ getDb: () => ({ execute: async () => [] }) }))
const { buildChatRoutes } = await import('./chat.js')

const NOW = new Date('2026-11-21T15:00:00Z')
const IP = '203.0.113.7'
const VISITOR = `visitor:${visitorId(IP)}|all`

function memoryStore() {
  const usage = new Map<string, number>()
  const store: AccountStore = {
    async usageCount(s, p) { return usage.get(`${s}|${p}`) ?? 0 },
    async reserveChat(s, p, limit) {
      const n = usage.get(`${s}|${p}`) ?? 0
      if (n >= limit) return null
      usage.set(`${s}|${p}`, n + 1)
      return n + 1
    },
    async releaseChat(s, p) { usage.set(`${s}|${p}`, Math.max(0, (usage.get(`${s}|${p}`) ?? 0) - 1)) },
    async getAiKey() { return null },
    async setAiKey() { throw new Error('unused') },
    async deleteAiKey() {},
    async getSubscription() { return null },
    async findSubscriptionUserByCustomer() { return null },
    async upsertSubscription() {},
  }
  return { store, usage }
}

/** An OpenRouter-style streamed completion: these SSE lines, then [DONE] */
function sse(lines: string[]): Response {
  const text = lines.map(l => `${l}\n\n`).join('') + 'data: [DONE]\n\n'
  const bytes = new TextEncoder().encode(text)
  // Split mid-line, as a network would
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7))
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}
const piece = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`
const citation = `data: ${JSON.stringify({ choices: [{ delta: { annotations: [{ type: 'url_citation', url_citation: { url: 'https://ksoutdoors.gov/ducks', title: 'KDWP ducks', content: 'Season dates' } }] } }] })}`

/** The events of a streamed reply, in order */
function events(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  return body.split('\n\n').filter(Boolean).map(block => {
    const event = /^event: (.*)$/m.exec(block)![1]
    const data = JSON.parse(/^data: (.*)$/m.exec(block)![1])
    return { event, data }
  })
}

let calls: Array<{ stream: boolean; web: boolean }>
let respond: (call: { stream: boolean; web: boolean }) => Response
const saved = { ...process.env }

beforeAll(() => {
  process.env.LLM_API_KEY = 'test-key'
  process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1'
  delete process.env.CHAT_WEB_SEARCH
  delete process.env.EMBEDDINGS_API_KEY
  delete process.env.OPENAI_API_KEY
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const call = { stream: body.stream === true, web: Array.isArray(body.plugins) }
    calls.push(call)
    return respond(call)
  }))
})
afterAll(() => {
  vi.unstubAllGlobals()
  process.env = saved
})

let ctx: { app: ReturnType<typeof Fastify>; usage: Map<string, number> }
beforeEach(async () => {
  calls = []
  const mem = memoryStore()
  const app = Fastify()
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  await app.register(buildChatRoutes({ store: mem.store, verifyUser: async () => null, now: () => NOW, isAdmin: () => false }), { prefix: '/api/chat' })
  ctx = { app, usage: mem.usage }
})

const ask = (stream: boolean) => ctx.app.inject({
  method: 'POST', url: '/api/chat', remoteAddress: IP,
  payload: { message: 'what decoy spread works?', ...(stream ? { stream: true } : {}) },
})

describe('POST /api/chat with stream: true', () => {
  it('sends status, the answer in pieces as written, then done with the web sources', async () => {
    respond = () => sse([': OPENROUTER PROCESSING', piece('Use a '), piece('small spread.'), citation])
    const res = await ask(true)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/)
    const evs = events(res.body)
    expect(evs.map(e => e.event)).toEqual(['status', 'status', 'text', 'text', 'done'])
    expect(evs.slice(0, 2).map(e => e.data.stage)).toEqual(['records', 'writing'])
    expect(evs.filter(e => e.event === 'text').map(e => e.data.text).join('')).toBe('Use a small spread.')
    const done = evs.at(-1)!.data
    expect(done.response).toBe('Use a small spread.')
    expect(done.sources).toEqual([expect.objectContaining({ url: 'https://ksoutdoors.gov/ducks', kind: 'web' })])
    expect(done.usage).toMatchObject({ plan: 'visitor', used: 1, limit: 3 })
    expect(calls).toEqual([{ stream: true, web: true }])
    expect(ctx.usage.get(VISITOR)).toBe(1)
  })

  it('answers without the web search when the search fails before any text', async () => {
    respond = c => (c.web ? new Response('provider down', { status: 500 }) : sse([piece('No search, still an answer.')]))
    const evs = events((await ask(true)).body)
    expect(evs.at(-1)).toMatchObject({ event: 'done', data: { response: 'No search, still an answer.', sources: [] } })
    expect(calls).toEqual([{ stream: true, web: true }, { stream: true, web: false }])
  })

  it('ends with an error event, and gives the question back, when the model fails mid-answer', async () => {
    respond = () => sse([piece('Half an'), `data: ${JSON.stringify({ error: { code: 502, message: 'upstream reset' } })}`])
    const evs = events((await ask(true)).body)
    expect(evs.map(e => e.event)).toEqual(['status', 'status', 'text', 'error'])
    expect(evs.at(-1)!.data).toMatchObject({ statusCode: 500, message: 'Failed to generate response' })
    // Not retried without the search: the reader already saw half an answer
    expect(calls).toHaveLength(1)
    expect(ctx.usage.get(VISITOR)).toBe(0)
  })

  it('still refuses with plain JSON before the answer starts (allowance used up)', async () => {
    ctx.usage.set(VISITOR, 3)
    const res = await ask(true)
    expect(res.statusCode).toBe(402)
    expect(res.json()).toMatchObject({ code: 'chat_limit' })
    expect(calls).toHaveLength(0)
  })
})

describe('POST /api/chat without stream', () => {
  it('still answers with one JSON body', async () => {
    respond = () => Response.json({ choices: [{ message: { content: 'One piece.', annotations: [] } }] })
    const res = await ask(false)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ response: 'One piece.', usage: { used: 1 } })
    expect(calls).toEqual([{ stream: false, web: true }])
  })
})
