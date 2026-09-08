export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`Server error (${status})`);
    this.name = "HttpStatusError";
  }
}

export const SERVER_UNREACHABLE_MESSAGE = "Could not reach the server. Is the dev server running?";

export function searchErrorMessage(err: unknown): string {
  if (err instanceof HttpStatusError) return err.message;
  // fetch rejects with a TypeError when it cannot open the connection
  if (err instanceof TypeError) return SERVER_UNREACHABLE_MESSAGE;
  const detail = err instanceof Error ? err.message : String(err);
  return `Search failed: ${detail}`;
}
