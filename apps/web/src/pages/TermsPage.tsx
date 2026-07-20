const LAST_UPDATED = 'July 20, 2026'

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
          HuntStack is currently in private development and has not launched a public beta. These terms
          cover use of the site during this pre-launch period and will be revisited before any public
          release.
        </p>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Not a substitute for official regulations
          </h2>
          <p>
            HuntStack aggregates hunting regulations, seasons, bag limits, and license information from
            public state and federal sources, and summarizes some of it using AI. This information is
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
            including accuracy, completeness, or fitness for a particular purpose. Given the app is in
            active pre-launch development, features, data, and availability may change or break without
            notice.
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
            If you create an account, you're responsible for keeping your credentials secure. Accounts
            currently have no effect on site functionality beyond sign-in — see our{' '}
            <a href="/privacy" className="text-accent-500 hover:underline">Privacy Policy</a> for what
            account data we hold.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Changes
          </h2>
          <p>
            Because the product is still pre-launch and actively changing, these terms will change too.
            We'll update the date above when it does, and post more formal terms before any public release.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2" style={{ color: `rgb(var(--color-text-primary))` }}>
            Contact
          </h2>
          <p>Questions about these terms: contact the site owner directly.</p>
        </section>
      </div>
    </div>
  )
}
