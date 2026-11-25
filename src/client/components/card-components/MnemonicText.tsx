import { sanitizeHtml } from "@client/utils/sanitize-html.ts";
import { styleMnemonicHtml } from "@shared/wanikani/mnemonic-utils.ts";

export function MnemonicText({ html }: { html: string }) {
  const styledHtml = styleMnemonicHtml(sanitizeHtml(html));

  return (
    <div
      className="text-sm leading-relaxed text-gray-700"
      dangerouslySetInnerHTML={{ __html: styledHtml }}
    />
  );
}
