import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { createFetchMock } from "./fetch-utils.ts";

export type ApiMock = {
  /** The parsed JSON body of every request the components sent. */
  requests: Record<string, unknown>[];
  answerWith: (data: LocalStudyMaterial | null) => void;
  failWith: (message: string) => void;
  reset: () => void;
  restore: () => void;
};

/** Answers the study material saves of the card editors, so a component test needs no server. */
export function installApiMock(): ApiMock {
  const requests: Record<string, unknown>[] = [];
  // other test files install their own fetch mock and never restore it, so this is whichever
  // mock was in place when this file loaded, not the real fetch
  const previousFetch = globalThis.fetch;
  let answer = () => jsonResponse({ ok: true, data: null }, 200);

  globalThis.fetch = createFetchMock(async (_input, init) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return answer();
  });

  return {
    requests,
    answerWith: (data) => {
      answer = () => jsonResponse({ ok: true, data }, 200);
    },
    failWith: (message) => {
      answer = () => jsonResponse({ ok: false, error: message }, 500);
    },
    reset: () => {
      requests.length = 0;
      answer = () => jsonResponse({ ok: true, data: null }, 200);
    },
    restore: () => {
      globalThis.fetch = previousFetch;
    },
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
