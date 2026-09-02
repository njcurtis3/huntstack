/**
 * Transport for the mobile API client: base-URL resolution, query-string
 * building and a single GET helper.
 *
 * Deliberately free of any React Native or Expo import so it stays pure logic
 * that vitest can run under node. Everything device-specific (expo-constants,
 * __DEV__) is read in api.ts and passed in.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

/** apps/api binds PORT 4000 by default (apps/api/src/index.ts). */
const API_PORT = 4000;

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BaseUrlSources {
  /** process.env.EXPO_PUBLIC_API_URL, inlined at build time by the Expo bundler. */
  envUrl?: string;
  /** Constants.expoConfig?.hostUri — the Metro dev server, e.g. "10.x.x.x:8081". */
  hostUri?: string | null;
  /** __DEV__ */
  isDev: boolean;
}

/**
 * Decide which API a build talks to.
 *
 * EXPO_PUBLIC_API_URL always wins. With it unset we are only willing to guess in
 * development, where the Metro dev server's own host is the LAN address the phone
 * or emulator reached us on — localhost is not routable from either, and apps/api
 * already binds every interface, not just loopback. A production build gets no
 * guess and no fallback: the production domain lives only in the
 * Cloudflare/Railway environment and is deliberately absent from this repo, so an
 * unset variable is a build misconfiguration and is reported as one.
 */
export function resolveApiBaseUrl({ envUrl, hostUri, isDev }: BaseUrlSources): string {
  const configured = envUrl?.trim();
  if (configured) {
    // A scheme-less value — the bare domain, no leading http:// — is a plausible
    // thing to type into a build environment, and without this it would reach
    // fetch as a relative URL and fail as an opaque network error rather than
    // the configuration error it actually is.
    if (!/^https?:\/\//i.test(configured)) {
      throw new Error(
        `EXPO_PUBLIC_API_URL must start with http:// or https:// — got "${configured}".`,
      );
    }
    return configured.replace(/\/+$/, '');
  }

  if (!isDev) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set. A production build has no dev server to derive an API host from — set EXPO_PUBLIC_API_URL at build time.',
    );
  }

  // hostUri is "host:port"; drop the Metro port and any trailing path.
  const host = hostUri?.split('/')[0].split(':')[0].trim();
  if (!host) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set and the Metro dev server host is unknown, so no API URL could be derived. Set EXPO_PUBLIC_API_URL in apps/mobile/.env — see .env.example.',
    );
  }

  return `http://${host}:${API_PORT}`;
}

/** Append the defined params only; undefined means "omit", not "send empty". */
export function buildUrl(baseUrl: string, path: string, params?: QueryParams): string {
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.append(key, String(value));
    }
  }
  const query = search.toString();
  return `${baseUrl}${path}${query ? `?${query}` : ''}`;
}

/**
 * GET JSON with a 30s timeout and the error body unwrapped into the thrown
 * Error's message — the two behaviours worth keeping from apps/web's client.
 * Handlers in apps/api report failures as either { message } (species, hunt) or
 * { error } (geo), so both are unwrapped before falling back to the status code.
 */
export async function getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal } = options;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  // If the caller also passed a signal, either one aborting should abort the request.
  if (callerSignal) {
    if (callerSignal.aborted) timeoutController.abort();
    else callerSignal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: timeoutController.signal,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError' && !callerSignal?.aborted) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: unknown; error?: unknown }
      | null;
    const message =
      typeof body?.message === 'string'
        ? body.message
        : typeof body?.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
    throw new Error(message);
  }

  // A 200 whose body is not JSON is not a hypothetical: a captive portal on hotel
  // or gas-station wifi answers every request with its own login page, which is
  // exactly the network a hunter is on the night before. Left unguarded this
  // rejects with a raw "Unexpected token < in JSON at position 0" that the screen
  // has no choice but to show the user.
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      'The server answered with something that was not hunting data. If you are on public wifi, you may need to sign in to the network first.',
    );
  }
}
