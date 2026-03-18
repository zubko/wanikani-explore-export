import DOMPurify from "dompurify";
import { MNEMONIC_TAGS } from "@/utils/mnemonic-utils.ts";

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: [...MNEMONIC_TAGS],
  });
}
