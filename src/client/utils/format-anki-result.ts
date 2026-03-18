import type { AnkiAddResult } from "@/model/wanikani.ts";

export function formatAnkiResult(result: AnkiAddResult): string {
  const subjectAction = result.subject.created ? "Added" : "Updated";
  const subjectName = result.subject.characters ?? result.subject.name;
  const parts = [`${subjectAction} ${subjectName}`];

  if (result.kanji.length > 0) {
    const created = result.kanji.filter((k) => k.created).length;
    const updated = result.kanji.length - created;
    if (created > 0) parts.push(`added ${created} kanji`);
    if (updated > 0) parts.push(`updated ${updated} kanji`);
  }

  if (result.radicals.length > 0) {
    const created = result.radicals.filter((r) => r.created).length;
    const updated = result.radicals.length - created;
    if (created > 0) parts.push(`added ${created} radical(s)`);
    if (updated > 0) parts.push(`updated ${updated} radical(s)`);
  }

  return parts.join(", ");
}
