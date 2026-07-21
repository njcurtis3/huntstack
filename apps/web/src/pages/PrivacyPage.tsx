import { Link } from 'react-router-dom'

const LAST_UPDATED = 'July 20, 2026'

export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
        Privacy Policy
      </h1>
      <p className="text-sm mb-8" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        Last updated: {LAST_UPDATED}
      </p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
        <p>
          HuntStack ("we", "us") is currently in private development and has not launched a public beta.
          This policy describes what happens with your data today, and will be revisited before any public
          release.
        </p>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            What we collect
          </h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Account information.</strong> If you create an account, authentication is handled by
              Supabase and includes your email address and password (password is never stored or seen by us
              directly — Supabase handles credential storage).
            </li>
            <li>
              <strong>Location, if you provide it.</strong> The "Where to Hunt" and Migration pages can use
              your device's location (only with your browser's permission) or a ZIP code you enter, to find
              hunting opportunities and refuges near you. Location is used to make that one request and is
              not stored on our servers.
            </li>
            <li>
              <strong>Chat history.</strong> Conversations with the AI chat assistant are stored only in
              your browser's local storage, on your device. We do not currently persist chat conversations
              on our servers tied to your identity.
            </li>
            <li>
              <strong>Standard server logs.</strong> Like most web services, our API logs requests (URL,
              timestamp, IP address) for debugging and abuse prevention. We don't currently run any
              third-party analytics or advertising trackers.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            How we use it
          </h2>
          <p>
            Solely to operate the product: authenticating you, answering location-based queries, and
            maintaining/debugging the service. We do not sell your data, and we do not share it with third
            parties except the infrastructure providers who host the app on our behalf (Supabase for
            database/auth, and our hosting providers).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Third-party data sources
          </h2>
          <p>
            HuntStack aggregates public hunting data from government and community sources (USFWS, state
            wildlife agencies, NOAA, eBird). Using our AI chat or search features may send your query text
            to our LLM provider (Together.ai) to generate a response. See the{' '}
            <a href="/data-sources" className="text-accent-500 hover:underline">Data Sources</a> page for
            the full list.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Your choices
          </h2>
          <p>
            You can clear your chat history at any time by clearing your browser's local storage for this
            site. If you've created an account, you can request deletion of it by contacting us at the
            email below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Changes
          </h2>
          <p>
            Because the product is still pre-launch and actively changing, this policy will change too.
            We'll update the date above when it does, and post a more formal policy before any public
            release.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Contact
          </h2>
          <p>
            Questions about this policy:{' '}
            <Link to="/contact" className="text-accent-500 hover:underline">get in touch</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
