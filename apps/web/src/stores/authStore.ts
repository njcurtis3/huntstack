import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getUser, onAuthStateChange, sendPasswordReset, signIn, signOut, signUp, updatePassword } from '../lib/supabase'

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
  /** Set when the person arrived from a password-reset email and must choose a new password */
  passwordRecovery: boolean
  /** A page asked for the sign-in box (e.g. chat when a visitor's free questions run out) */
  authPrompt: 'signin' | 'signup' | null

  // Actions
  promptAuth: (mode: 'signin' | 'signup') => void
  clearAuthPrompt: () => void
  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, userType?: 'hunter' | 'outfitter') => Promise<void>
  logout: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  setNewPassword: (password: string) => Promise<void>
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      passwordRecovery: false,
      authPrompt: null,

      promptAuth: (mode) => set({ authPrompt: mode }),
      clearAuthPrompt: () => set({ authPrompt: null }),

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
            if (event === 'PASSWORD_RECOVERY') set({ passwordRecovery: true })
            if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
              const user = session.user
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

      register: async (email: string, password: string, _userType = 'hunter') => {
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

      requestPasswordReset: async (email: string) => {
        const { error } = await sendPasswordReset(email)
        if (error) throw error
      },

      setNewPassword: async (password: string) => {
        const { error } = await updatePassword(password)
        if (error) throw error
        set({ passwordRecovery: false })
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
