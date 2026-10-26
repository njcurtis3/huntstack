// The one inbox HuntStack answers from, shared by the Contact page and the beta feedback links.
export const CONTACT_EMAIL = 'nathanjcurtis3@gmail.com'

// A mailto: with the page the reader was on, so feedback arrives with its context.
export function feedbackMailto(pageUrl: string): string {
  const subject = 'HuntStack beta feedback'
  const body = `Page: ${pageUrl}\n\nWhat worked, what didn't, or what's wrong:\n\n`
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
