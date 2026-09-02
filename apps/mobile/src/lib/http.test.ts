import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildUrl, getJson, resolveApiBaseUrl } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fetch that answers once with the given status and JSON body. */
function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('resolveApiBaseUrl', () => {
  it('prefers EXPO_PUBLIC_API_URL and strips a trailing slash', () => {
    expect(
      resolveApiBaseUrl({ envUrl: 'https://api.example.test/', hostUri: 'metro-host:8081', isDev: true }),
    ).toBe('https://api.example.test');
  });

  it('derives the LAN API host from the Metro dev server in development', () => {
    // hostUri is normally a LAN IP with Metro's port on it.
    expect(resolveApiBaseUrl({ hostUri: 'metro-host:8081', isDev: true })).toBe('http://metro-host:4000');
  });

  it('throws in a production build when EXPO_PUBLIC_API_URL is unset', () => {
    expect(() => resolveApiBaseUrl({ hostUri: 'metro-host:8081', isDev: false })).toThrow(
      /EXPO_PUBLIC_API_URL is not set/,
    );
  });

  it('throws in development when there is no dev server host to derive from', () => {
    expect(() => resolveApiBaseUrl({ hostUri: null, isDev: true })).toThrow(/dev server host is unknown/);
  });

  it('treats a blank EXPO_PUBLIC_API_URL as unset', () => {
    expect(() => resolveApiBaseUrl({ envUrl: '   ', isDev: false })).toThrow(/EXPO_PUBLIC_API_URL is not set/);
  });
});

describe('buildUrl', () => {
  it('omits undefined params rather than sending them empty', () => {
    expect(
      buildUrl('http://api.test', '/api/hunt/recommendations', {
        species: 'snow-goose',
        states: undefined,
        limit: 10,
      }),
    ).toBe('http://api.test/api/hunt/recommendations?species=snow-goose&limit=10');
  });

  it('leaves the path alone when every param is undefined', () => {
    expect(buildUrl('http://api.test', '/api/species', { category: undefined })).toBe(
      'http://api.test/api/species',
    );
  });

  it('encodes values that need it', () => {
    expect(buildUrl('http://api.test', '/api/geo/search', { q: 'Stuttgart AR' })).toBe(
      'http://api.test/api/geo/search?q=Stuttgart+AR',
    );
  });
});

describe('getJson', () => {
  it('returns the parsed body on success', async () => {
    stubFetch(200, { species: [{ slug: 'snow-goose' }] });
    await expect(getJson<{ species: { slug: string }[] }>('http://api.test/api/species')).resolves.toEqual({
      species: [{ slug: 'snow-goose' }],
    });
  });

  it('unwraps a { message } error body', async () => {
    stubFetch(404, { error: true, message: "Species 'wombat' not found" });
    await expect(getJson('http://api.test/api/species/wombat')).rejects.toThrow(
      "Species 'wombat' not found",
    );
  });

  it('unwraps a { error } error body — the shape the geo routes use', async () => {
    stubFetch(400, { error: 'Invalid zip code' });
    await expect(getJson('http://api.test/api/geo/zip/nope')).rejects.toThrow('Invalid zip code');
  });

  it('falls back to the status code when the error body is not JSON', async () => {
    stubFetch(502, '<html>bad gateway</html>');
    await expect(getJson('http://api.test/api/species')).rejects.toThrow('HTTP 502');
  });

  it('reports a timeout in words a hunter can act on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted.');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );
    await expect(getJson('http://api.test/api/species', { timeoutMs: 5 })).rejects.toThrow(
      /Request timed out/,
    );
  });

  it("rethrows the caller's own abort instead of calling it a timeout", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted.');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );
    const caller = new AbortController();
    const pending = getJson('http://api.test/api/species', { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow(/operation was aborted/);
  });
});
