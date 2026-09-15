import toast from "react-hot-toast";
import type { Kanji, Radical } from "@/model/wanikani.ts";
import { getPrimaryMeaning } from "@/model/subject-utils.ts";
import { getRadicalSvgUrl } from "@/model/radical-utils.ts";
import { getReadingsByType, type ReadingWithPrimary } from "@/model/kanji-utils.ts";
import { subjectColors } from "@/config/theme.ts";
import { AddToAnkiButton } from "./card-components/AddToAnkiButton.tsx";
import { CardHeader } from "./card-components/CardHeader.tsx";
import { HintBox } from "./card-components/HintBox.tsx";
import { LabeledRow } from "./card-components/LabeledRow.tsx";
import { MnemonicText } from "./card-components/MnemonicText.tsx";
import { NoteSection, type NoteSectionProps } from "./card-components/NoteSection.tsx";
import { RelatedSubjectsSection } from "./card-components/RelatedSubjectsSection.tsx";
import { scrollToElement } from "../utils/scroll-to-element.ts";
import { SectionTitle } from "./card-components/SectionTitle.tsx";
import { UserSynonymsRow, type UserSynonymsRowProps } from "./card-components/UserSynonymsRow.tsx";
import { api } from "../api.ts";
import { formatAnkiResult } from "../utils/format-anki-result.ts";
import { noteProps, synonymProps } from "../utils/study-material-props.ts";

type KanjiCardProps = {
  kanji: Kanji;
};

export function KanjiCard({ kanji }: KanjiCardProps) {
  const primaryMeaning = getPrimaryMeaning(kanji.meanings);

  const handleAddToAnki = () => {
    const radicalCount = kanji.componentRadicals.length;
    toast.promise(api.addToAnki(kanji.id, kanji.object), {
      loading:
        radicalCount > 0
          ? `Adding ${kanji.characters} with ${radicalCount} radical(s)...`
          : `Adding ${kanji.characters}...`,
      success: (result) => formatAnkiResult(result),
      error: (err) => `Failed: ${err.message}`,
    });
  };

  return (
    <div className="rounded-lg bg-white shadow">
      <CardHeader
        subjectType="kanji"
        title={primaryMeaning}
        character={kanji.characters}
        documentUrl={kanji.documentUrl}
        actions={<AddToAnkiButton onClick={handleAddToAnki} />}
      />
      <div className="divide-y divide-gray-200">
        <RadicalCombinationSection componentRadicals={kanji.componentRadicals} />
        <MeaningSection
          meanings={kanji.meanings}
          synonyms={{ ...synonymProps(kanji), hint: "not in Anki" }}
          mnemonic={kanji.meaningMnemonic}
          hint={kanji.meaningHint}
          note={noteProps(kanji, "meaning_note")}
        />
        <ReadingsSection
          readings={kanji.readings}
          mnemonic={kanji.readingMnemonic}
          hint={kanji.readingHint}
          note={noteProps(kanji, "reading_note")}
        />
        <RelatedSubjectsSection
          title="Visually Similar Kanji"
          items={kanji.visuallySimilarKanji}
          subjectType="kanji"
          color={subjectColors.kanji}
        />
        <RelatedSubjectsSection
          title="Found In Vocabulary"
          items={kanji.foundInVocabulary}
          subjectType="vocabulary"
          color={subjectColors.vocabulary}
        />
      </div>
    </div>
  );
}

function RadicalCombinationSection({ componentRadicals }: { componentRadicals: Radical[] }) {
  if (componentRadicals.length === 0) return null;

  return (
    <div className="p-4">
      <SectionTitle>Radical Combination</SectionTitle>
      <div className="flex flex-wrap gap-3">
        {componentRadicals.map((radical) => (
          <RadicalItem
            key={radical.id}
            radical={radical}
            onClick={() => scrollToElement(`radical-${radical.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

function RadicalItem({ radical, onClick }: { radical: Radical; onClick: () => void }) {
  const primaryMeaning = getPrimaryMeaning(radical.meanings);
  const svgUrl = getRadicalSvgUrl(radical);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1.5 rounded-md p-1 transition-colors hover:bg-gray-100"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-white"
        style={{ backgroundColor: subjectColors.radical }}
      >
        {radical.characters ??
          (svgUrl ? <img src={svgUrl} alt="" className="h-6 w-6 invert" /> : "?")}
      </div>
      <span className="text-sm text-gray-700">{primaryMeaning}</span>
    </button>
  );
}

function MeaningSection({
  meanings,
  synonyms,
  mnemonic,
  hint,
  note,
}: {
  meanings: Kanji["meanings"];
  synonyms: UserSynonymsRowProps;
  mnemonic: string;
  hint: string;
  note: NoteSectionProps;
}) {
  const primaryMeaning = getPrimaryMeaning(meanings);
  const alternativeMeanings = meanings
    .filter((m) => !m.primary && m.accepted_answer)
    .map((m) => m.meaning);

  return (
    <div className="p-4">
      <SectionTitle>Meaning</SectionTitle>
      <div className="space-y-3">
        <LabeledRow label="Primary" value={primaryMeaning} bold />
        {alternativeMeanings.length > 0 && (
          <LabeledRow label="Alternative" value={alternativeMeanings.join(", ")} />
        )}
        <UserSynonymsRow {...synonyms} />
        <MnemonicBlock mnemonic={mnemonic} hint={hint} note={note} />
      </div>
    </div>
  );
}

function ReadingsSection({
  readings,
  mnemonic,
  hint,
  note,
}: {
  readings: Kanji["readings"];
  mnemonic: string;
  hint: string;
  note: NoteSectionProps;
}) {
  return (
    <div className="p-4">
      <SectionTitle>Readings</SectionTitle>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <ReadingColumn label="On'yomi" readings={getReadingsByType(readings, "onyomi")} />
          <ReadingColumn label="Kun'yomi" readings={getReadingsByType(readings, "kunyomi")} />
          <ReadingColumn label="Nanori" readings={getReadingsByType(readings, "nanori")} />
        </div>
        <MnemonicBlock mnemonic={mnemonic} hint={hint} note={note} />
      </div>
    </div>
  );
}

function ReadingColumn({ label, readings }: { label: string; readings: ReadingWithPrimary[] }) {
  const hasPrimary = readings.some((r) => r.primary);

  return (
    <div>
      <h4 className={`text-sm ${hasPrimary ? "font-medium text-gray-900" : "text-gray-500"}`}>
        {label}
      </h4>
      <p className="text-lg">
        {readings.length > 0
          ? readings.map((r, i) => (
              <span key={r.reading}>
                {i > 0 && ", "}
                <span className={r.primary ? "font-medium" : undefined}>{r.reading}</span>
              </span>
            ))
          : "-"}
      </p>
    </div>
  );
}

function MnemonicBlock({
  mnemonic,
  hint,
  note,
}: {
  mnemonic: string;
  hint: string;
  note: NoteSectionProps;
}) {
  return (
    <>
      <div>
        <h4 className="mb-1.5 text-sm font-medium text-gray-500">Mnemonic</h4>
        <MnemonicText html={mnemonic} />
      </div>
      {hint && <HintBox hint={hint} />}
      <NoteSection {...note} />
    </>
  );
}
