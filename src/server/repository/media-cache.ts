import { mkdir, readdir, readFile } from "fs/promises";
import { isMissingFile, writeFileAtomic } from "@server/utils/json-utils.ts";

type MediaFolder = "radicals" | "mnemonics" | "readings" | "sentences";

export type FetchedMedia = { data: Buffer; extension: string };

export const MEDIA_ROOT_PATH = "./data/userdata/media";

const EXTENSIONS_BY_CONTENT_TYPE = new Map([
  ["image/svg+xml", "svg"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
]);

/**
 * Reads the file from disk when it is there, else fetches it once and keeps it. A hit never
 * touches the network, so a card still builds when the source drops the file.
 */
export async function getOrFetchMedia(params: {
  folder: MediaFolder;
  nameWithoutExtension: string;
  fetch: () => Promise<FetchedMedia>;
}): Promise<{ fileName: string; data: Buffer }> {
  const { folder, nameWithoutExtension } = params;
  const folderPath = `${MEDIA_ROOT_PATH}/${folder}`;

  const cachedFileName = await findCachedFileName(folderPath, nameWithoutExtension);
  if (cachedFileName !== null) {
    const data = await readFile(`${folderPath}/${cachedFileName}`);
    console.log(`[Media] Cache hit: ${folder}/${cachedFileName}`);
    return { fileName: cachedFileName, data };
  }

  await mkdir(folderPath, { recursive: true });
  const media = await params.fetch();
  const fileName = `${nameWithoutExtension}.${media.extension}`;
  // The Linux box commits on a timer, so a half-written file must never sit under the real name
  await writeFileAtomic(`${folderPath}/${fileName}`, media.data);
  const sizeKb = (media.data.length / 1024).toFixed(1);
  console.log(`[Media] Cache miss: ${folder}/${fileName} (${sizeKb} KB)`);
  return { fileName, data: media.data };
}

export function extensionOfContentType(contentType: string | null): string {
  const mediaType = contentType?.split(";")[0]?.trim() ?? "";
  const extension = EXTENSIONS_BY_CONTENT_TYPE.get(mediaType);
  if (extension === undefined) throw new Error(`Unknown media content type: ${contentType}`);
  return extension;
}

async function findCachedFileName(
  folderPath: string,
  nameWithoutExtension: string
): Promise<string | null> {
  const prefix = `${nameWithoutExtension}.`;
  // An extension with a dot in it is a temp file of a write that is still running or failed
  const matches = (await listFolder(folderPath)).filter(
    (entry) => entry.startsWith(prefix) && /^[^.]+$/.test(entry.slice(prefix.length))
  );
  if (matches.length > 1) {
    const names = matches.join(", ");
    throw new Error(
      `Two cached files for ${folderPath}/${nameWithoutExtension}: ${names}, delete one`
    );
  }
  return matches[0] ?? null;
}

async function listFolder(folderPath: string): Promise<string[]> {
  try {
    return await readdir(folderPath);
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}
