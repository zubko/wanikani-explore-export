import { subjectColors } from "@/config/theme.ts";

export const MNEMONIC_TAGS = ["radical", "kanji", "vocabulary", "reading"] as const;

const MNEMONIC_TAG_COLORS: Record<string, string> = {
  radical: subjectColors.radical,
  kanji: subjectColors.kanji,
  vocabulary: subjectColors.vocabulary,
  reading: "#555",
};

export function styleMnemonicHtml(html: string): string {
  return Object.entries(MNEMONIC_TAG_COLORS).reduce(
    (result, [tag, color]) =>
      result.replace(
        new RegExp(`<${tag}>([^<]+)</${tag}>`, "g"),
        `<span style="background-color: ${color}; color: white; padding: 0 4px; border-radius: 3px;">$1</span>`
      ),
    html
  );
}
