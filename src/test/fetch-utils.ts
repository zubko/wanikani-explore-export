const originalPreconnect = globalThis.fetch.preconnect;

export function createFetchMock(
  handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return Object.assign(handler, { preconnect: originalPreconnect }) as typeof fetch;
}

export function resolveUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}
