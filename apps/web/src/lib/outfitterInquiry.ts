import { getSession } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export interface InquiryInput {
  message: string
  name?: string
  phone?: string
  preferredDates?: string
  partySize?: number
}

export interface InquiryReceipt {
  id: string
  createdAt: string
}

async function messageFor(response: Response): Promise<string> {
  // 400, 409 and 429 carry a plain message from the API; show it verbatim.
  if (response.status === 400 || response.status === 409 || response.status === 429) {
    const body = await response.json().catch(() => null)
    if (body && typeof body.message === 'string' && body.message) return body.message
  }
  switch (response.status) {
    case 400:
      return 'The message was not accepted. Check the fields and try again.'
    case 401:
      return 'Your session expired. Please sign in again.'
    case 404:
      return 'This listing is no longer available.'
    case 409:
      return 'This outfitter has not claimed their listing yet.'
    case 429:
      return 'You can send 5 inquiries a day. Please try again later.'
    case 503:
      return 'Messaging is temporarily unavailable. Please try again later.'
    default:
      return 'Something went wrong sending your message. Please try again.'
  }
}

/**
 * POST an inquiry to a claimed listing. This is the only place the web client
 * sends the Supabase access token to the outfitter endpoints; it is read at call
 * time and never stored here.
 */
export async function sendOutfitterInquiry(outfitterId: string, input: InquiryInput): Promise<InquiryReceipt> {
  const session = await getSession()
  if (!session?.access_token) throw new Error('Please sign in to message this outfitter.')

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/outfitters/${encodeURIComponent(outfitterId)}/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Could not reach HuntStack. Check your connection and try again.')
  }

  if (!response.ok) throw new Error(await messageFor(response))
  return (await response.json()) as InquiryReceipt
}
