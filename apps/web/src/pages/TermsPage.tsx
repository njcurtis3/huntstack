import { Link } from 'react-router-dom'

const LAST_UPDATED = 'November 11, 2026'

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
        Terms of Use
      </h1>
      <p className="text-sm mb-8" style={{ color: `rgb(var(--color-text-tertiary))` }}>
        Last updated: {LAST_UPDATED}
      </p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: `rgb(var(--color-text-secondary))` }}>
        <p>
          These terms cover your use of HuntStack. By using the site you agree to them.
        </p>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Not a substitute for official regulations
          </h2>
          <p>
            HuntStack aggregates hunting regulations, seasons, bag limits, and license information from
            public state and federal sources, and summarizes some of it using AI. The AI chat also draws on
            web search results, which can include third-party sites we do not control. This information is
            provided for planning convenience only and may be incomplete, outdated, or misinterpreted by
            the summarization process. <strong>Always verify seasons, bag limits, licensing requirements,
            and legal hunting methods with the official state wildlife agency before you hunt.</strong> You
            are solely responsible for complying with applicable hunting laws and regulations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            AI-generated content
          </h2>
          <p>
            The chat assistant and generated summaries use a large language model and may produce
            inaccurate, incomplete, or outdated information, including about regulations that carry legal
            or safety consequences. Do not rely on AI-generated answers as your sole source before hunting.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            No warranty
          </h2>
          <p>
            The site and its data are provided "as is," without warranty of any kind, express or implied,
            including accuracy, completeness, or fitness for a particular purpose. Features, data, and
            availability may change without notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Limitation of liability
          </h2>
          <p>
            To the fullest extent permitted by law, HuntStack and its operator are not liable for any
            damages, injury, fines, or legal consequences arising from reliance on information provided
            through this site, including regulation summaries, hunt recommendations, or AI-generated
            content.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Outfitter listings
          </h2>
          <p>
            Outfitter listings are informational and do not constitute an endorsement. We are not a party
            to any booking or transaction between you and an outfitter, and are not responsible for the
            services outfitters provide.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Accounts
          </h2>
          <p>
            If you create an account, you're responsible for keeping your credentials secure. See our{' '}
            <a href="/privacy" className="text-accent-500 hover:underline">Privacy Policy</a> for what
            account data we hold.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            AI questions, the map and subscriptions
          </h2>
          <p className="mb-2">
            Visitors can ask the AI a few questions without an account, and free accounts get a set number
            each month. Without Pro, the map opens a set number of details a day (currently 10); moving
            around the map and changing layers or dates is not limited. HuntStack Pro costs $5.99 per
            month, billed by Stripe, renews each month until you cancel, and removes both limits. A
            fair-use rate limit still applies to stop automated use.
          </p>
          <p className="mb-2">
            You can cancel any time in Settings. Cancelling stops future charges; you keep Pro until the end
            of the month you've paid for. We may change the price or the free allowance; a price change
            applies from your next renewal after we tell you about it.
          </p>
          <p>
            If you add your own AI key, your questions run on your account with that provider. You pay the
            provider for them, under its terms, and you're responsible for the key and its charges.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Changes
          </h2>
          <p>
            We'll update these terms as the product changes, and change the date above when we do.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Contact
          </h2>
          <p>
            Questions about these terms:{' '}
            <Link to="/contact" className="text-accent-500 hover:underline">get in touch</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
