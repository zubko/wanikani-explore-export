import { readJson, saveJsonAtomic } from "@server/utils/json-utils.ts";

type MnemonicImageCache = Record<string, string | null>;

const MNEMONIC_IMAGES_CACHE_PATH = "./data/userdata/mnemonic-images.json";

async function loadMnemonicImageCache(): Promise<MnemonicImageCache> {
  try {
    return await readJson<MnemonicImageCache>(MNEMONIC_IMAGES_CACHE_PATH);
  } catch {
    return {};
  }
}

// Atomic, because the data folder is a git repo that a sync job commits on its own
// schedule: a plain write could be committed half-written.
async function saveMnemonicImageCache(cache: MnemonicImageCache): Promise<void> {
  await saveJsonAtomic(MNEMONIC_IMAGES_CACHE_PATH, cache);
}

async function fetchMnemonicImageUrl(documentUrl: string): Promise<string | null> {
  const response = await fetch(documentUrl);
  const html = await response.text();
  const match = html.match(/<wk-mnemonic-image[^>]+src="([^"]+)"/);
  return match?.[1] ?? null;
}

export class MnemonicImageFetcher {
  private cache: MnemonicImageCache;
  private pendingFetches = new Map<string, Promise<string | null>>();
  private hasUnsavedChanges = false;

  constructor(cache: MnemonicImageCache) {
    this.cache = cache;
  }

  async get(documentUrl: string): Promise<string | null> {
    if (documentUrl in this.cache) {
      return this.cache[documentUrl]!;
    }

    const pending = this.pendingFetches.get(documentUrl);
    if (pending) {
      return pending;
    }

    const fetchPromise = this.fetchAndCache(documentUrl);
    this.pendingFetches.set(documentUrl, fetchPromise);
    return fetchPromise;
  }

  private async fetchAndCache(documentUrl: string): Promise<string | null> {
    try {
      const imageUrl = await fetchMnemonicImageUrl(documentUrl);
      this.cache[documentUrl] = imageUrl;
      this.hasUnsavedChanges = true;
      return imageUrl;
    } catch {
      return null;
    } finally {
      this.pendingFetches.delete(documentUrl);
    }
  }

  async saveIfNeeded(): Promise<void> {
    if (this.hasUnsavedChanges) {
      await saveMnemonicImageCache(this.cache);
      this.hasUnsavedChanges = false;
    }
  }
}

export async function createMnemonicImageFetcher(): Promise<MnemonicImageFetcher> {
  const cache = await loadMnemonicImageCache();
  return new MnemonicImageFetcher(cache);
}
