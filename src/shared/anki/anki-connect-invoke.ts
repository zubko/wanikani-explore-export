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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch {
    throw createAnkiError("Failed to connect to Anki. Is Anki running?", action, params);
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
