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
  "What are the waterfowl hunting seasons in Texas?",
  "Where can I hunt snow geese in New Mexico?",
  "What license do I need for duck hunting in Arkansas as a non-resident?",
  "When does conservation order start in the Central Flyway?",
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
          ? 'The AI service is not configured yet. Please set the ANTHROPIC_API_KEY in your .env file to enable the chat assistant.'
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
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-forest-100 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-forest-600" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">HuntStack AI Assistant</h1>
            <p className="text-sm text-gray-500">Ask anything about hunting regulations, seasons, and locations</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            // Empty state with suggestions
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-forest-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Bot className="w-8 h-8 text-forest-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                How can I help you today?
              </h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Ask me about hunting regulations, seasons, license requirements,
                or help finding the perfect hunting location.
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500 mb-3">Try asking:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      onClick={() => handleSuggestedQuestion(question)}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Message list
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 bg-forest-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-forest-600" />
                    </div>
                  )}

                  <div className={`max-w-[80%] ${message.role === 'user' ? '' : ''}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-forest-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>

                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-500 font-medium">Sources:</p>
                        {message.sources.map((source, i) => (
                          <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                            {source.url ? (
                              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-forest-600 hover:underline inline-flex items-center gap-1">
                                {source.title} <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span>{source.title}</span>
                            )}
                            {source.snippet && (
                              <span className="text-gray-400 ml-1">- {source.snippet}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-forest-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-forest-600" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-4">
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
          <p className="text-xs text-gray-500 mt-2 text-center">
            AI responses are for informational purposes. Always verify regulations with official sources.
          </p>
        </form>
      </div>
    </div>
  )
}
