import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { createFetchMock } from "./fetch-utils.ts";

/** A held back answer. The request stays in flight until the test calls `resolve`. */
export type HeldAnswer = { resolve: () => void };

export type ApiMock = {
  /** The parsed JSON body of every request the components sent. */
  requests: Record<string, unknown>[];
  answerWith: (data: LocalStudyMaterial | null) => void;
  failWith: (message: string) => void;
  answerLater: (id: number, data: LocalStudyMaterial | null) => HeldAnswer;
  failLater: (id: number, message: string) => HeldAnswer;
  reset: () => void;
  restore: () => void;
};

type HeldRequest = { id: number; open: Promise<void>; response: () => Response };

/** Answers the study material saves of the card editors, so a component test needs no server. */
export function installApiMock(): ApiMock {
  const requests: Record<string, unknown>[] = [];
  // other test files install their own fetch mock and never restore it, so this is whichever
  // mock was in place when this file loaded, not the real fetch
  const previousFetch = globalThis.fetch;
  const held: HeldRequest[] = [];
  let answer = () => jsonResponse({ ok: true, data: null }, 200);

  const hold = (id: number, response: () => Response): HeldAnswer => {
    let open = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    held.push({ id, open: gate, response });
    return { resolve: () => open() };
  };

  globalThis.fetch = createFetchMock(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push(body);
    const index = held.findIndex((item) => item.id === body.id);
    if (index < 0) return answer();
    const [next] = held.splice(index, 1);
    await next!.open;
    return next!.response();
  });

  return {
    requests,
    answerWith: (data) => {
      answer = () => jsonResponse({ ok: true, data }, 200);
    },
    failWith: (message) => {
      answer = () => jsonResponse({ ok: false, error: message }, 500);
    },
    answerLater: (id, data) => hold(id, () => jsonResponse({ ok: true, data }, 200)),
    failLater: (id, message) => hold(id, () => jsonResponse({ ok: false, error: message }, 500)),
    reset: () => {
      requests.length = 0;
      held.length = 0;
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
