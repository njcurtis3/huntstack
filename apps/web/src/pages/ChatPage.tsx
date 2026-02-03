import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const suggestedQuestions = [
  "What are the elk hunting seasons in Colorado?",
  "Where can I hunt waterfowl in Arkansas?",
  "What license do I need for deer hunting in Texas as a non-resident?",
  "Best public land for mule deer in Wyoming?",
  "When does duck season open in the Central Flyway?",
]

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // TODO: Replace with actual API call to RAG endpoint
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Thanks for your question about "${userMessage.content}". 

This is a placeholder response. Once the backend is connected, I'll be able to:

• Search our database of hunting regulations across all 50 states
• Provide specific season dates and bag limits
• Explain license requirements
• Recommend hunting locations based on your criteria
• Answer questions about migratory bird patterns

The AI assistant will use RAG (Retrieval-Augmented Generation) to provide accurate, up-to-date information sourced from official state and federal wildlife agencies.`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsLoading(false)
    }, 1500)
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
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
                  
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-forest-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
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
