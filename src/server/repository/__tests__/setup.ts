import { writeCalls, resetWriteCalls, ensureRepositoryInitialized } from "@/test/preload.ts";
import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";

type MockState = {
  fetchCalls: string[];
  writeCalls: typeof writeCalls;
  fetchResponses: Map<string, string>;
};

export const mockState: MockState = {
  fetchCalls: [],
  writeCalls,
  fetchResponses: new Map(),
};

export function resetMockState() {
  mockState.fetchCalls = [];
  resetWriteCalls();
  mockState.fetchResponses.clear();
}

export function setFetchResponse(url: string, html: string) {
  mockState.fetchResponses.set(url, html);
}

const originalFetch = globalThis.fetch;

export function installFetchMock() {
  globalThis.fetch = createFetchMock(async (input) => {
    const url = resolveUrl(input);
    mockState.fetchCalls.push(url);
    const html = mockState.fetchResponses.get(url) ?? "";
    return new Response(html, { status: 200 });
  });
}

export function restoreFetchMock() {
  globalThis.fetch = originalFetch;
}

export { ensureRepositoryInitialized };
