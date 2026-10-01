import { createHash } from "crypto";

export function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 8);
}

export function hashNumber(text: string): number {
  return parseInt(shortHash(text), 16);
}
