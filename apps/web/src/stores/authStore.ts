import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getUser, getSession, onAuthStateChange, signIn, signOut, signUp } from '../lib/supabase'

interface User {
  id: string
  email: string
  displayName?: string
  userType: 'hunter' | 'outfitter'
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  
  // Actions
  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, userType?: 'hunter' | 'outfitter') => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,

      initialize: async () => {
        try {
          const user = await getUser()
          if (user) {
            set({
              user: {
                id: user.id,
                email: user.email || '',
                displayName: user.user_metadata?.display_name,
                userType: user.user_metadata?.user_type || 'hunter',
              },
              isAuthenticated: true,
              isLoading: false,
            })
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false })
          }

          // Listen for auth changes
          onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
              const user = (session as any).user
              set({
                user: {
                  id: user.id,
                  email: user.email || '',
                  displayName: user.user_metadata?.display_name,
                  userType: user.user_metadata?.user_type || 'hunter',
                },
                isAuthenticated: true,
              })
            } else if (event === 'SIGNED_OUT') {
              set({ user: null, isAuthenticated: false })
            }
          })
        } catch (error) {
          console.error('Auth initialization error:', error)
          set({ user: null, isAuthenticated: false, isLoading: false })
        }
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const { error } = await signIn(email, password)
          if (error) throw error
        } finally {
          set({ isLoading: false })
        }
      },

      register: async (email: string, password: string, userType = 'hunter') => {
        set({ isLoading: true })
        try {
          const { error } = await signUp(email, password)
          if (error) throw error
          // Note: User metadata would be set after email confirmation
        } finally {
          set({ isLoading: false })
        }
      },

      logout: async () => {
        set({ isLoading: true })
        try {
          await signOut()
          set({ user: null, isAuthenticated: false })
        } finally {
          set({ isLoading: false })
        }
      },

      setUser: (user) => {
        set({ user, isAuthenticated: !!user })
      },
    }),
    {
      name: 'huntstack-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
