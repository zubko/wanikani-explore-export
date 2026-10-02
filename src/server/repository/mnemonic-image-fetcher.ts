import { appendFile, readFile } from "fs/promises";
import { isMissingFile } from "@server/utils/json-utils.ts";
import { createReloadingFile } from "@server/utils/reloading-file.ts";

type MnemonicImageLine = { page: string; image: string | null };

export const MNEMONIC_IMAGES_PATH = "./data/userdata/mnemonic-images.jsonl";

// Append-only, so git merges the lines of both machines and a pulled line shows on the next lookup
const registry = createReloadingFile({
  path: MNEMONIC_IMAGES_PATH,
  parse: parseMnemonicImageLines,
});
const pendingFetches = new Map<string, Promise<string | null>>();

/** Reads the registry once, so a broken line fails the start. */
export async function loadMnemonicImageRegistry(): Promise<void> {
  await registry.get();
}

export async function getMnemonicImageUrl(documentUrl: string): Promise<string | null> {
  const images = await registry.get();
  if (images.has(documentUrl)) return images.get(documentUrl) ?? null;

  const pending = pendingFetches.get(documentUrl);
  if (pending) return pending;

  // Cleared only after the append, so a lookup in between waits instead of scraping again
  const lookup = scrapeAndRecord(documentUrl).finally(() => pendingFetches.delete(documentUrl));
  pendingFetches.set(documentUrl, lookup);
  return lookup;
}

/**
 * Two lines for one page come from the two machines, and git's union merge puts them in no fixed
 * order. So the merge never depends on the order: a URL beats `null`, two different URLs throw.
 */
export function parseMnemonicImageLines(content: string | null): Map<string, string | null> {
  const images = new Map<string, string | null>();
  if (content === null) return images;

  content.split("\n").forEach((text, index) => {
    if (text.trim() === "") return;
    const lineNumber = index + 1;
    const { page, image } = parseLine(text, lineNumber);

    const known = images.get(page);
    if (known === undefined || known === null) {
      images.set(page, image);
    } else if (image !== null && image !== known) {
      throw invalidLine(lineNumber, `page ${page} has two images, delete one line`);
    }
  });
  return images;
}

async function scrapeAndRecord(documentUrl: string): Promise<string | null> {
  let image: string | null;
  try {
    image = await fetchMnemonicImageUrl(documentUrl);
  } catch (error) {
    // A `null` in an append-only file stays forever, so only a page that was really read is recorded
    console.error(`[Repository] Mnemonic image scrape failed: ${documentUrl}. ${String(error)}`);
    return null;
  }
  const line = JSON.stringify({ page: documentUrl, image }) + "\n";
  // A hand edit can drop the last newline, and the new line must not join the last one
  const separator = (await lacksFinalNewline(MNEMONIC_IMAGES_PATH)) ? "\n" : "";
  await appendFile(MNEMONIC_IMAGES_PATH, separator + line);
  console.log(`[Repository] Mnemonic image recorded: ${documentUrl} -> ${image ?? "none"}`);
  return image;
}

async function lacksFinalNewline(path: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf-8");
    return content !== "" && !content.endsWith("\n");
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function fetchMnemonicImageUrl(documentUrl: string): Promise<string | null> {
  const response = await fetch(documentUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const match = html.match(/<wk-mnemonic-image[^>]+src="([^"]+)"/);
  return match?.[1] ?? null;
}

function parseLine(text: string, lineNumber: number): MnemonicImageLine {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw invalidLine(lineNumber, String(error));
  }
  if (!isMnemonicImageLine(value)) {
    throw invalidLine(lineNumber, 'expected {"page": string, "image": string | null}');
  }
  return value;
}

function isMnemonicImageLine(value: unknown): value is MnemonicImageLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const line = value as Record<string, unknown>;
  return typeof line.page === "string" && (typeof line.image === "string" || line.image === null);
}

function invalidLine(lineNumber: number, problem: string): Error {
  return new Error(`Invalid ${MNEMONIC_IMAGES_PATH} line ${lineNumber}: ${problem}`);
}
