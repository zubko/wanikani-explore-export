import { HttpStatusError } from "./http-error.ts";

export const SERVER_UNREACHABLE_MESSAGE = "Could not reach the server. Is the dev server running?";

export function searchErrorMessage(err: unknown): string {
  return knownErrorMessage(err) ?? `Search failed: ${errorDetail(err)}`;
}

export function saveErrorMessage(err: unknown): string {
  return knownErrorMessage(err) ?? errorDetail(err);
}

function knownErrorMessage(err: unknown): string | null {
  if (err instanceof HttpStatusError) return err.message;
  // fetch rejects with a TypeError when it cannot open the connection
  if (err instanceof TypeError) return SERVER_UNREACHABLE_MESSAGE;
  return null;
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
