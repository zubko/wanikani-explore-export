import type { Radical } from "./wanikani.ts";

export function getRadicalSvgUrl(radical: Radical): string | undefined {
  return radical.characterImages.find(
    (img) => img.content_type === "image/svg+xml" && img.metadata.inline_styles
  )?.url;
}
