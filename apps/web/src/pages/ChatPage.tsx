import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Sparkles, ExternalLink, Search, MapPin, FileText, Bird, TreePine, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source {
  title: string
  url?: string
  snippet: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  searchResults?: SearchResult[]
  timestamp: number // stored as epoch for localStorage serialization
}

type SearchResult = {
  type: string
  id: string
  title: string
  snippet: string
  stateCode?: string
  category?: string
}

// ─── localStorage persistence ─────────────────────────────────────────────────

const STORAGE_KEY = 'huntstack_chat'

function loadSession(): { messages: Message[]; conversationId: string | undefined } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { messages: [], conversationId: undefined }
    return JSON.parse(raw)
  } catch {
    return { messages: [], conversationId: undefined }
  }
}

function saveSession(messages: Message[], conversationId: string | undefined) {
  try {
    // Keep last 50 messages to avoid bloat
    const trimmed = messages.slice(-50)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: trimmed, conversationId }))
  } catch {
    // storage full — ignore
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getResultIcon(type: string) {
  switch (type) {
    case 'species': return <Bird className="w-5 h-5 text-forest-500" />
    case 'regulation': return <FileText className="w-5 h-5 text-accent-500" />
    case 'location': return <TreePine className="w-5 h-5 text-forest-500" />
    default: return <MapPin className="w-5 h-5 text-earth-500" />
  }
}

function getResultLink(result: SearchResult) {
  switch (result.type) {
    case 'species': return `/species/${result.id}`
    case 'regulation': return result.stateCode ? `/regulations/${result.stateCode.toLowerCase()}` : '/regulations'
    case 'location': return '/map'
    default: return '#'
  }
}

const FALLBACK_SUGGESTIONS = [
  "Are snow geese moving in Arkansas right now?",
  "Where should I hunt waterfowl this weekend?",
  "What license do I need for duck hunting in Texas as a non-resident?",
  "When does the conservation order start in the Central Flyway?",
  "What are the bag limits for geese in Kansas?",
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatPage() {
  const session = loadSession()
  const [messages, setMessages] = useState<Message[]>(session.messages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>(session.conversationId)
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Persist to localStorage whenever messages/conversationId change
  useEffect(() => {
    saveSession(messages, conversationId)
  }, [messages, conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load dynamic suggestions from live migration/push-factor data
  useEffect(() => {
    async function loadSuggestions() {
      try {
        const data = await api.getMigrationPushFactors()
        if (!data?.pushFactors?.length) return

        const dynamic: string[] = []

        // Top push-score state
        const top = data.pushFactors
          .filter(pf => pf.pushScore > 0)
          .sort((a, b) => b.pushScore - a.pushScore)[0]

        if (top) {
          const STATE_NAMES: Record<string, string> = {
            TX: 'Texas', AR: 'Arkansas', LA: 'Louisiana',
            NM: 'New Mexico', KS: 'Kansas', OK: 'Oklahoma', MO: 'Missouri',
          }
          const name = STATE_NAMES[top.stateCode] || top.stateCode
          if (top.coldFrontPresent) {
            dynamic.push(`Cold front hitting ${name} — are birds moving right now?`)
          } else if (top.coldFrontIncoming) {
            dynamic.push(`Cold front incoming in ${name} — when will birds start moving?`)
          } else {
            dynamic.push(`Where should I hunt waterfowl in ${name} this week?`)
          }
        }

        // High push-score states for snow geese
        const highPush = data.pushFactors.filter(pf => pf.pushScore >= 2)
        if (highPush.length > 0) {
          const codes = highPush.map(pf => pf.stateCode).slice(0, 2).join(' or ')
          dynamic.push(`Are snow geese moving in ${codes} right now?`)
        }

        // Fill rest with fallbacks if not enough dynamic ones
        const merged = [...dynamic, ...FALLBACK_SUGGESTIONS].slice(0, 5)
        setSuggestions(merged)
      } catch {
        // fallback stays
      }
    }
    loadSuggestions()
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // Run AI + keyword search in parallel
    const searchPromise = api.search(text.trim(), { type: 'all' }).catch(() => null)
    const chatPromise = api.chat(text.trim(), conversationId).catch((err: Error) => ({ error: err }))

    const [searchData, chatData] = await Promise.all([searchPromise, chatPromise])

    const searchResults = searchData
      ? (searchData as { results: SearchResult[] }).results?.slice(0, 4)
      : undefined

    let content: string
    let sources: Source[] | undefined

    if ('error' in chatData) {
      const err = chatData.error as Error
      content = err.message.includes('503')
        ? 'The AI service is not configured yet. Please set the TOGETHER_API_KEY in your .env file to enable the chat assistant.'
        : 'Sorry, something went wrong. Please try again.'
    } else {
      const cd = chatData as { response: string; sources: Source[]; conversationId: string }
      content = cd.response
      sources = cd.sources
      if (cd.conversationId) setConversationId(cd.conversationId)
    }

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content,
      sources,
      searchResults: searchResults?.length ? searchResults : undefined,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, assistantMsg])
    setIsLoading(false)
  }, [isLoading, conversationId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const clearHistory = () => {
    setMessages([])
    setConversationId(undefined)
    localStorage.removeItem(STORAGE_KEY)
    inputRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <div className="border-b px-4 py-3" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent-500" />
            </div>
            <div>
              <h1 className="font-semibold text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>HuntStack AI</h1>
              <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                Live migration data + regulations + seasons — ask anything
              </p>
            </div>
          </div>
          {!isEmpty && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md hover:bg-earth-100 dark:hover:bg-earth-800 transition-colors"
              style={{ color: `rgb(var(--color-text-tertiary))` }}
              title="Clear conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" /> New chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {isEmpty ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Bot className="w-8 h-8 text-accent-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
                How can I help you today?
              </h2>
              <p className="mb-8 max-w-md mx-auto" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Ask about regulations, seasons, licenses, or where birds are moving — I pull live data to answer.
              </p>
              <div>
                <p className="text-xs font-medium mb-3" style={{ color: `rgb(var(--color-text-tertiary))` }}>Try asking:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="card px-3 py-1.5 text-sm hover:border-accent-400 dark:hover:border-accent-500 transition-colors text-left"
                      style={{ color: `rgb(var(--color-text-secondary))` }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-accent-500" />
                    </div>
                  )}

                  <div className="max-w-[85%] space-y-3">
                    {/* Message bubble */}
                    <div
                      className={`rounded-lg px-4 py-3 ${message.role === 'user' ? 'bg-accent-500 text-white' : ''}`}
                      style={message.role === 'assistant' ? {
                        backgroundColor: `rgb(var(--color-bg-secondary))`,
                        color: `rgb(var(--color-text-primary))`,
                      } : undefined}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                    </div>

                    {/* Inline search results (assistant only) */}
                    {message.role === 'assistant' && message.searchResults && message.searchResults.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium flex items-center gap-1" style={{ color: `rgb(var(--color-text-tertiary))` }}>
                          <Search className="w-3 h-3" /> Related records
                        </p>
                        {message.searchResults.map((result) => (
                          <Link
                            key={`${result.type}-${result.id}`}
                            to={getResultLink(result)}
                            className="flex items-start gap-2 px-3 py-2 rounded-md hover:border-accent-400 dark:hover:border-accent-500 transition-colors card"
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              {getResultIcon(result.type)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium" style={{ color: `rgb(var(--color-text-primary))` }}>{result.title}</span>
                                <span className="text-xs rounded-full px-1.5 py-0.5 capitalize bg-earth-100 dark:bg-earth-800 text-earth-500 dark:text-earth-400">
                                  {result.type}
                                </span>
                                {result.stateCode && (
                                  <span className="text-xs rounded-full px-1.5 py-0.5 bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400">
                                    {result.stateCode}
                                  </span>
                                )}
                              </div>
                              {result.snippet && (
                                <p className="text-xs line-clamp-1 mt-0.5" style={{ color: `rgb(var(--color-text-tertiary))` }}>{result.snippet}</p>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Sources */}
                    {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium" style={{ color: `rgb(var(--color-text-tertiary))` }}>Sources:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {message.sources.map((source, i) => (
                            <div key={i} className="text-xs rounded px-2 py-1" style={{ backgroundColor: `rgb(var(--color-bg-secondary))`, color: `rgb(var(--color-text-secondary))` }}>
                              {source.url ? (
                                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline inline-flex items-center gap-1">
                                  {source.title} <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span>{source.title}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 bg-earth-200 dark:bg-earth-700">
                      <User className="w-4 h-4 text-earth-600 dark:text-earth-300" />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-accent-500" />
                  </div>
                  <div className="rounded-lg px-4 py-3 flex items-center gap-1" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
                    <span className="w-2 h-2 rounded-full bg-earth-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-earth-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-earth-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div
        className="border-t px-4 py-4"
        style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))` }}
      >
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about regulations, seasons, where birds are moving..."
              className="input flex-1"
              disabled={isLoading}
              autoComplete="off"
            />
            <button type="submit" disabled={!input.trim() || isLoading} className="btn-primary px-6">
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs mt-2 text-center" style={{ color: `rgb(var(--color-text-tertiary))` }}>
            Always verify regulations with official state sources before hunting.
          </p>
        </form>
      </div>
    </div>
  )
}
