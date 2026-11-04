import { isVisibleSubject } from "../../src/model/subject-utils.ts";
import type { KanjiData, RadicalData, VocabularyData } from "../../src/model/wanikani.ts";

export type ReferenceType = "vocabulary" | "kanji" | "radical";

export type Reference = {
  id: number;
  type: ReferenceType;
  characters: string;
};

export type ReferenceLookup = Record<ReferenceType, Map<string, number>>;

export type SourceNote = {
  type: ReferenceType;
  label: string;
  characters: string;
  fields: Record<string, string>;
};

export type MissingReference = Reference & { mentionedIn: string };

// a context sentence is full of other words and points to none of them
const TEXT_FIELDS: Record<ReferenceType, string[]> = {
  radical: ["mnemonic_text", "note"],
  kanji: [
    "meaning_mnemonic",
    "meaning_hint",
    "meaning_note",
    "reading_mnemonic",
    "reading_hint",
    "reading_note",
  ],
  vocabulary: ["meaning_explanation", "meaning_note", "reading_explanation", "reading_note"],
};

const MENTION = /[぀-ヿ㐀-䶿一-鿿々〆ヶ〜]+/g;
const KANJI_CHARACTER = /[㐀-䶿一-鿿々〆ヶ]/;
const LOOKUP_ORDER: ReferenceType[] = ["vocabulary", "kanji", "radical"];

export function buildReferenceLookup(params: {
  vocabulary: VocabularyData[];
  kanji: KanjiData[];
  radicals: RadicalData[];
}): ReferenceLookup {
  return {
    vocabulary: mapByCharacters(params.vocabulary),
    kanji: mapByCharacters(params.kanji),
    radical: mapByCharacters(params.radicals),
  };
}

/**
 * The WaniKani items that the text fields of the notes mention and that are not in Anki, each
 * once, and the mentions that match no item.
 */
export function findMissingReferences(params: {
  notes: SourceNote[];
  lookup: ReferenceLookup;
  idsInAnki: Set<number>;
}): { missing: MissingReference[]; unmatched: string[] } {
  const { notes, lookup, idsInAnki } = params;
  const missing = new Map<number, MissingReference>();
  const unmatched = new Set<string>();

  for (const note of notes) {
    for (const field of TEXT_FIELDS[note.type]) {
      for (const mention of findMentions(note.fields[field] ?? "")) {
        if (mention === note.characters) continue;
        const reference = resolveMention(lookup, mention);
        if (!reference) {
          unmatched.add(mention);
        } else if (!idsInAnki.has(reference.id) && !missing.has(reference.id)) {
          missing.set(reference.id, { ...reference, mentionedIn: note.label });
        }
      }
    }
  }

  return { missing: [...missing.values()], unmatched: [...unmatched] };
}

/** The runs of Japanese text in the HTML that hold at least one kanji. */
export function findMentions(html: string): string[] {
  // a tag ends a run, so "<kanji>人</kanji>の" gives 人 and not 人の
  const text = html.replace(/<[^>]*>/g, " ");
  const runs = text.match(MENTION) ?? [];
  return [...new Set(runs.filter((run) => KANJI_CHARACTER.test(run)))];
}

/** A word with exactly these characters first, then a kanji, then a radical. */
export function resolveMention(lookup: ReferenceLookup, mention: string): Reference | null {
  for (const type of LOOKUP_ORDER) {
    const id = lookup[type].get(mention);
    if (id !== undefined) return { id, type, characters: mention };
  }
  return null;
}

function mapByCharacters(
  subjects: Array<VocabularyData | KanjiData | RadicalData>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const subject of subjects) {
    const { characters } = subject.data;
    if (characters && isVisibleSubject(subject)) map.set(characters, subject.id);
  }
  return map;
}
