import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Sparkles, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'

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
  timestamp: Date
}

const suggestedQuestions = [
  "Are snow geese moving in Arkansas right now?",
  "Where should I hunt waterfowl this weekend?",
  "What license do I need for duck hunting in Texas as a non-resident?",
  "When does the conservation order start in the Central Flyway?",
  "What are the bag limits for geese in Kansas?",
]

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const data = await api.chat(text.trim(), conversationId)

      if (data.conversationId) {
        setConversationId(data.conversationId)
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        sources: data.sources,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error instanceof Error && error.message.includes('503')
          ? 'The AI service is not configured yet. Please set the TOGETHER_API_KEY in your .env file to enable the chat assistant.'
          : 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleSuggestedQuestion = (question: string) => {
    sendMessage(question)
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-4" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent-500" />
          </div>
          <div>
            <h1 className="font-semibold text-sm" style={{ color: `rgb(var(--color-text-primary))` }}>HuntStack AI Assistant</h1>
            <p className="text-xs" style={{ color: `rgb(var(--color-text-tertiary))` }}>Live migration data + regulations + seasons — ask anything</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Bot className="w-8 h-8 text-accent-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
                How can I help you today?
              </h2>
              <p className="mb-8 max-w-md mx-auto" style={{ color: `rgb(var(--color-text-secondary))` }}>
                Ask me about hunting regulations, seasons, license requirements,
                or help finding the perfect hunting location.
              </p>

              <div className="space-y-2">
                <p className="text-xs font-medium mb-3" style={{ color: `rgb(var(--color-text-tertiary))` }}>Try asking:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      onClick={() => handleSuggestedQuestion(question)}
                      className="card px-3 py-1.5 text-sm hover:border-accent-400 dark:hover:border-accent-500 transition-colors"
                      style={{ color: `rgb(var(--color-text-secondary))` }}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-accent-500" />
                    </div>
                  )}

                  <div className="max-w-[80%]">
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-accent-500 text-white'
                          : ''
                      }`}
                      style={message.role === 'assistant' ? {
                        backgroundColor: `rgb(var(--color-bg-secondary))`,
                        color: `rgb(var(--color-text-primary))`,
                      } : undefined}
                    >
                      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                    </div>

                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium" style={{ color: `rgb(var(--color-text-tertiary))` }}>Sources:</p>
                        {message.sources.map((source, i) => (
                          <div key={i} className="text-xs rounded px-2 py-1" style={{ backgroundColor: `rgb(var(--color-bg-secondary))`, color: `rgb(var(--color-text-secondary))` }}>
                            {source.url ? (
                              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline inline-flex items-center gap-1">
                                {source.title} <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span>{source.title}</span>
                            )}
                            {source.snippet && (
                              <span className="ml-1" style={{ color: `rgb(var(--color-text-tertiary))` }}>- {source.snippet}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-earth-200 dark:bg-earth-700">
                      <User className="w-4 h-4 text-earth-600 dark:text-earth-300" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-accent-50 dark:bg-accent-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-accent-500" />
                  </div>
                  <div className="rounded-lg px-4 py-3" style={{ backgroundColor: `rgb(var(--color-bg-secondary))` }}>
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: `rgb(var(--color-text-tertiary))` }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t px-4 py-4" style={{ backgroundColor: `rgb(var(--color-bg-elevated))`, borderColor: `rgb(var(--color-border-primary))` }}>
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about hunting regulations, seasons, locations..."
              className="input flex-1"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="btn-primary px-6"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs mt-2 text-center" style={{ color: `rgb(var(--color-text-tertiary))` }}>
            AI responses are for informational purposes. Always verify regulations with official sources.
          </p>
        </form>
      </div>
    </div>
  )
}
