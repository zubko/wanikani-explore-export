import { getErrorMessage } from "@shared/error-message.ts";

type AnkiConnectError = {
  message: string;
  action: string;
  params?: unknown;
};

export const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

export async function invokeAnkiConnect<T>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      // AnkiConnect closes the socket after every answer but never says so. When the close comes
      // late, as it does while Anki runs its own sync, a reused socket fails the next request
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch (err) {
    throw createAnkiError(
      `Failed to connect to Anki. Is Anki running? (${fetchErrorCause(err)})`,
      action,
      params
    );
  }

  const data = await response.json();

  if (data.error) {
    throw createAnkiError(String(data.error), action, params);
  }

  return data.result as T;
}

export function createAnkiError(
  message: string,
  action: string,
  params?: unknown
): AnkiConnectError {
  return { message, action, params };
}

// Node's fetch says only "fetch failed" and keeps the real network error in `cause`
function fetchErrorCause(err: unknown): string {
  const cause = err instanceof Error ? err.cause : undefined;
  return getErrorMessage(cause ?? err);
}
