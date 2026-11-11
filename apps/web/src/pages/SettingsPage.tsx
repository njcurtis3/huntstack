import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, CreditCard, KeyRound, Loader2, Settings as SettingsIcon, User } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import {
  AccountError,
  beginOpenRouterConnect,
  finishOpenRouterConnect,
  getAccount,
  openBillingPortal,
  removeAiKey,
  saveAiKey,
  startCheckout,
  type Account,
  type Provider,
  type ProviderInfo,
} from '../lib/account'

const PRICE = '$5.99'

const text = {
  primary: { color: 'rgb(var(--color-text-primary))' },
  secondary: { color: 'rgb(var(--color-text-secondary))' },
  tertiary: { color: 'rgb(var(--color-text-tertiary))' },
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2
        className="flex items-center gap-2.5 text-[15px] font-semibold px-5 sm:px-6 py-3.5 border-b"
        style={{ ...text.primary, borderColor: 'rgb(var(--color-border-primary))' }}
      >
        {icon}
        {title}
      </h2>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

function Notice({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`text-sm mt-3 ${kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-forest-600 dark:text-forest-400'}`}
    >
      {children}
    </p>
  )
}

export function SettingsPage() {
  const { user, isAuthenticated, isLoading: authLoading, promptAuth, logout } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [account, setAccount] = useState<Account | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setAccount(await getAccount())
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your settings.')
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) load()
    else setAccount(null)
  }, [isAuthenticated, load])

  // Back from Stripe Checkout: the webhook may land a moment after the redirect, so check again
  const billing = searchParams.get('billing')
  useEffect(() => {
    if (billing !== 'success' || !isAuthenticated) return
    let tries = 0
    const t = window.setInterval(async () => {
      tries++
      try {
        const a = await getAccount()
        setAccount(a)
        if (a.subscription?.active || tries >= 6) window.clearInterval(t)
      } catch {
        if (tries >= 6) window.clearInterval(t)
      }
    }, 2000)
    return () => window.clearInterval(t)
  }, [billing, isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <SettingsIcon className="w-10 h-10 mx-auto mb-4 text-accent-500" />
        <h1 className="text-2xl font-bold mb-3" style={text.primary}>Settings</h1>
        <p className="text-sm mb-6" style={text.secondary}>
          {authLoading ? 'Checking your sign-in…' : 'Sign in to see your plan, your AI questions and billing.'}
        </p>
        {!authLoading && (
          <div className="flex justify-center gap-2">
            <button onClick={() => promptAuth('signin')} className="btn-outline text-sm">Sign in</button>
            <button onClick={() => promptAuth('signup')} className="btn-primary text-sm">Create free account</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight" style={text.primary}>Settings</h1>

      {billing === 'success' && (
        <p role="status" className="card p-4 text-sm text-forest-700 dark:text-forest-300">
          {account?.subscription?.active
            ? 'Thanks for subscribing. You have unlimited AI questions and the full map.'
            : 'Thanks for subscribing. Your plan will show as active in a moment.'}
        </p>
      )}

      {loadError && !account && (
        <div className="card p-4 text-sm">
          <p className="text-red-600 dark:text-red-400 mb-2">{loadError}</p>
          <button onClick={load} className="btn-outline text-sm">Try again</button>
        </div>
      )}

      {!account && !loadError && (
        <p className="flex items-center gap-2 text-sm" style={text.secondary}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your settings…
        </p>
      )}

      {account && (
        <>
          <PlanSection account={account} onChanged={load} />
          <OwnKeySection
            account={account}
            onChanged={load}
            oauthCode={searchParams.get('code')}
            clearOauthCode={() => {
              const next = new URLSearchParams(searchParams)
              next.delete('code')
              setSearchParams(next, { replace: true })
            }}
          />
        </>
      )}

      <Section icon={<User className="w-5 h-5 text-accent-500" />} title="Account">
        <p className="text-sm mb-4" style={text.secondary}>
          Signed in as <strong style={text.primary}>{user?.email}</strong>
        </p>
        <PasswordForm />
        <button onClick={() => logout()} className="btn-outline text-sm mt-4">Sign out</button>
      </Section>
    </div>
  )
}

function PlanSection({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { usage, subscription } = account

  const go = async (action: () => Promise<{ url: string }>) => {
    setBusy(true)
    setError(null)
    try {
      const { url } = await action()
      window.location.assign(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
      onChanged()
    }
  }

  const planName =
    usage.plan === 'admin' ? 'Admin'
      : usage.plan === 'pro' ? 'HuntStack Pro'
        : usage.plan === 'own_key' ? 'Free, with your own AI key'
          : 'Free'

  return (
    <Section icon={<CreditCard className="w-5 h-5 text-accent-500" />} title="Plan and AI questions">
      <p className="text-sm" style={text.secondary}>
        Plan: <strong style={text.primary}>{planName}</strong>
      </p>
      <p className="text-sm mt-1" style={text.secondary}>
        {usage.limit === null
          ? usage.plan === 'own_key'
            ? 'Unlimited questions. Your AI provider bills you for each one.'
            : usage.plan === 'admin'
              ? 'Unlimited questions, not counted or billed.'
              : 'Unlimited questions.'
          : `${usage.used} of ${usage.limit} free questions used this month. Resets ${formatDate(usage.resetsAt)}.`}
      </p>

      {usage.plan === 'admin' ? null : subscription?.active ? (
        <>
          <p className="text-sm mt-3" style={text.secondary}>
            {subscription.cancelAtPeriodEnd
              ? `Your subscription ends ${formatDate(subscription.currentPeriodEnd)}.`
              : subscription.currentPeriodEnd
                ? `${PRICE}/month, renews ${formatDate(subscription.currentPeriodEnd)}.`
                : `${PRICE}/month.`}
            {subscription.status === 'past_due' && ' Your last payment failed; update your card to keep Pro.'}
          </p>
          <button onClick={() => go(openBillingPortal)} disabled={busy} className="btn-outline text-sm mt-4 disabled:opacity-60">
            {busy ? 'Opening…' : 'Manage billing'}
          </button>
        </>
      ) : account.billingAvailable ? (
        <div className="mt-4 rounded-md border border-t-2 border-t-accent-500 p-4" style={{ borderColor: 'rgb(var(--color-border-primary))', borderTopColor: 'rgb(var(--color-accent))' }}>
          <p className="font-semibold text-sm" style={text.primary}>HuntStack Pro, {PRICE}/month</p>
          <ul className="text-sm mt-2 space-y-1" style={text.secondary}>
            <li className="flex gap-2"><Check className="w-4 h-4 text-forest-500 shrink-0 mt-0.5" />Unlimited AI questions</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-forest-500 shrink-0 mt-0.5" />The full map, with no daily tap limit</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-forest-500 shrink-0 mt-0.5" />Cancel any time from this page</li>
          </ul>
          <button onClick={() => go(startCheckout)} disabled={busy} className="btn-primary text-sm mt-4 disabled:opacity-60">
            {busy ? 'Opening checkout…' : `Subscribe for ${PRICE}/month`}
          </button>
          <p className="text-xs mt-2" style={text.tertiary}>Payment is handled by Stripe. HuntStack never sees your card.</p>
          {subscription && !subscription.active && (
            <button onClick={() => go(openBillingPortal)} disabled={busy} className="text-xs text-accent-500 hover:underline mt-2 py-1">
              See past invoices
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm mt-3" style={text.tertiary}>Subscriptions are coming soon.</p>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Section>
  )
}

function ModelPicker({ provider, value, onChange, id }: { provider: ProviderInfo; value: string; onChange: (v: string) => void; id: string }) {
  return provider.models ? (
    <select id={id} value={value} onChange={e => onChange(e.target.value)} className="input w-full">
      {provider.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
    </select>
  ) : (
    <input
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={provider.defaultModel}
      className="input w-full font-mono text-sm"
      autoComplete="off"
      spellCheck={false}
    />
  )
}

function OwnKeySection({
  account,
  onChanged,
  oauthCode,
  clearOauthCode,
}: {
  account: Account
  onChanged: () => void
  oauthCode: string | null
  clearOauthCode: () => void
}) {
  const providers = account.providers
  const byId = (id: Provider) => providers.find(p => p.id === id)!
  const saved = account.aiKey
  const [provider, setProvider] = useState<Provider>(saved?.provider ?? 'anthropic')
  const [model, setModel] = useState(saved?.model ?? byId(saved?.provider ?? 'anthropic').defaultModel)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const info = byId(provider)

  // Returning from OpenRouter's sign-in with ?code=
  const handledCode = useRef(false)
  useEffect(() => {
    if (!oauthCode || handledCode.current) return
    handledCode.current = true
    setBusy(true)
    finishOpenRouterConnect(oauthCode, byId('openrouter').defaultModel)
      .then(() => {
        setNotice({ kind: 'ok', text: 'OpenRouter is connected. Your questions now run on your OpenRouter account.' })
        onChanged()
      })
      .catch(err => setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not connect OpenRouter.' }))
      .finally(() => {
        setBusy(false)
        clearOauthCode()
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthCode])

  const changeProvider = (p: Provider) => {
    setProvider(p)
    setModel(saved?.provider === p ? saved.model : byId(p).defaultModel)
    setApiKey('')
    setNotice(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const keepingKey = !apiKey.trim() && saved?.provider === provider
      await saveAiKey(provider, keepingKey ? null : apiKey.trim(), model.trim() || info.defaultModel)
      setApiKey('')
      setNotice({ kind: 'ok', text: keepingKey ? 'Model changed.' : 'Key checked and saved. Your questions now run on your own account.' })
      onChanged()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof AccountError || err instanceof Error ? err.message : 'Could not save the key.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await removeAiKey()
      setNotice({ kind: 'ok', text: "Key removed. Your questions use HuntStack's AI again." })
      onChanged()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not remove the key.' })
    } finally {
      setBusy(false)
    }
  }

  const connectOpenRouter = async () => {
    setNotice(null)
    try {
      await beginOpenRouterConnect()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not start the OpenRouter sign-in.' })
    }
  }

  return (
    <Section icon={<KeyRound className="w-5 h-5 text-accent-500" />} title="Use your own AI">
      <p className="text-sm" style={text.secondary}>
        Add your own AI key and ask HuntStack as many questions as you like, free. Your AI provider bills you
        for each question, usually a few cents.
      </p>
      <p className="text-xs mt-2" style={text.tertiary}>
        This needs an API key. A Claude Pro or ChatGPT Plus subscription can't be connected; Anthropic and
        OpenAI don't allow other apps to use them. Your key is encrypted and never shown again.
      </p>

      {!account.ownKeysAvailable ? (
        <p className="text-sm mt-4" style={text.tertiary}>Own AI keys are coming soon.</p>
      ) : (
        <>
          {saved && (
            <div className="mt-4 rounded-lg border p-3 text-sm flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'rgb(var(--color-border-primary))' }}>
              <span style={text.secondary}>
                Using <strong style={text.primary}>{byId(saved.provider).label}</strong>, key ending{' '}
                <span className="font-mono">{saved.last4}</span>, model <span className="font-mono">{saved.model}</span>
              </span>
              <button onClick={remove} disabled={busy} className="btn-outline text-sm disabled:opacity-60">Remove key</button>
            </div>
          )}

          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="ai-provider" className="block text-xs font-medium mb-1" style={text.secondary}>Provider</label>
              <select id="ai-provider" value={provider} onChange={e => changeProvider(e.target.value as Provider)} className="input w-full">
                {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <p className="text-xs mt-1" style={text.tertiary}>
                {info.webSearch
                  ? 'Searches the web for each question, like HuntStack\'s own AI.'
                  : 'Answers from HuntStack\'s data only, without a web search.'}
              </p>
            </div>

            {provider === 'openrouter' && (
              <div>
                <button type="button" onClick={connectOpenRouter} disabled={busy} className="btn-primary text-sm disabled:opacity-60">
                  Connect with OpenRouter
                </button>
                <p className="text-xs mt-1" style={text.tertiary}>Sign in to OpenRouter and approve; no key to copy. Or paste a key below.</p>
              </div>
            )}

            <div>
              <label htmlFor="ai-key" className="block text-xs font-medium mb-1" style={text.secondary}>
                API key{saved?.provider === provider ? ' (leave empty to keep the saved one)' : ''}
              </label>
              <input
                id="ai-key"
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={`${info.keyPrefix}…`}
                className="input w-full font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-500 hover:underline inline-block py-1">
                Get a key from {info.label.replace(/ \(.*\)$/, '').replace(' API key', '')}
              </a>
            </div>

            <div>
              <label htmlFor="ai-model" className="block text-xs font-medium mb-1" style={text.secondary}>Model</label>
              <ModelPicker id="ai-model" provider={info} value={model} onChange={setModel} />
            </div>

            <button
              type="submit"
              disabled={busy || (!apiKey.trim() && saved?.provider !== provider)}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {busy ? 'Checking…' : saved?.provider === provider && !apiKey.trim() ? 'Save model' : 'Check and save key'}
            </button>
          </form>
        </>
      )}
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <p className="text-xs mt-4" style={text.tertiary}>
        Questions? See <Link to="/privacy" className="text-accent-500 hover:underline">Privacy</Link>.
      </p>
    </Section>
  )
}

function PasswordForm() {
  const { setNewPassword } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-accent-500 hover:underline py-1">
        Change password
      </button>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await setNewPassword(password)
      setPassword('')
      setNotice({ kind: 'ok', text: 'Password changed.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not change the password.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 max-w-sm">
      <label htmlFor="new-password" className="block text-xs font-medium" style={text.secondary}>New password</label>
      <input
        id="new-password"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="input w-full"
      />
      <button type="submit" disabled={busy} className="btn-primary text-sm disabled:opacity-60">
        {busy ? 'Saving…' : 'Save password'}
      </button>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    </form>
  )
}
