import type { Radical } from "@/model/wanikani.ts";
import toast from "react-hot-toast";
import { getPrimaryMeaning } from "@/model/subject-utils.ts";
import { getRadicalSvgUrl } from "@/model/radical-utils.ts";
import { subjectColors } from "@/config/theme.ts";
import { api } from "../api.ts";
import { formatAnkiResult } from "../utils/format-anki-result.ts";
import { AddToAnkiButton } from "./card-components/AddToAnkiButton.tsx";
import { CardHeader } from "./card-components/CardHeader.tsx";
import { LabeledRow } from "./card-components/LabeledRow.tsx";
import { MnemonicText } from "./card-components/MnemonicText.tsx";
import { NoteSection } from "./card-components/NoteSection.tsx";
import { RelatedSubjectsSection } from "./card-components/RelatedSubjectsSection.tsx";
import { UserSynonymsRow, type UserSynonymsRowProps } from "./card-components/UserSynonymsRow.tsx";
import { noteProps, synonymProps } from "../utils/study-material-props.ts";

type RadicalCardProps = {
  radical: Radical;
};

export function RadicalCard({ radical }: RadicalCardProps) {
  const primaryMeaning = getPrimaryMeaning(radical.meanings);
  const svgUrl = getRadicalSvgUrl(radical);
  const characterImage = svgUrl ? <img src={svgUrl} alt="" className="h-8 w-8 invert" /> : null;

  const handleAddToAnki = () => {
    toast.promise(api.addToAnki(radical.id, radical.object), {
      loading: "Saving to Anki...",
      success: (result) => formatAnkiResult(result),
      error: (err) => `Failed: ${err.message}`,
    });
  };

  return (
    <div className="rounded-lg bg-white shadow">
      <CardHeader
        subjectType="radical"
        title={primaryMeaning}
        character={radical.characters}
        characterImage={characterImage}
        documentUrl={radical.documentUrl}
        actions={<AddToAnkiButton onClick={handleAddToAnki} />}
      />
      <div className="divide-y divide-gray-200">
        <NameSection meanings={radical.meanings} synonyms={synonymProps(radical)} />
        <MnemonicSection mnemonic={radical.meaningMnemonic} imageUrl={radical.mnemonicImageUrl} />
        <div className="p-4">
          <NoteSection {...noteProps(radical, "meaning_note")} />
        </div>
        <RelatedSubjectsSection
          title="Found In Kanji"
          items={radical.foundInKanji}
          subjectType="kanji"
          color={subjectColors.kanji}
        />
      </div>
    </div>
  );
}

function NameSection({
  meanings,
  synonyms,
}: {
  meanings: Radical["meanings"];
  synonyms: UserSynonymsRowProps;
}) {
  const primaryMeaning = getPrimaryMeaning(meanings);
  const alternativeMeanings = meanings
    .filter((m) => !m.primary && m.accepted_answer)
    .map((m) => m.meaning);

  return (
    <div className="p-4">
      <h3 className="mb-3 text-lg font-medium text-gray-900">Name</h3>
      <div className="space-y-2">
        <LabeledRow label="Primary" value={primaryMeaning} bold />
        {alternativeMeanings.length > 0 && (
          <LabeledRow label="Alternative" value={alternativeMeanings.join(", ")} />
        )}
        <UserSynonymsRow {...synonyms} />
      </div>
    </div>
  );
}

function MnemonicSection({ mnemonic, imageUrl }: { mnemonic: string; imageUrl: string | null }) {
  return (
    <div className="p-4">
      <h3 className="mb-3 text-lg font-medium text-gray-900">Mnemonic</h3>
      <MnemonicText html={mnemonic} />
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Mnemonic illustration"
          className="mt-3 max-w-xs rounded border border-gray-200 bg-white p-2"
        />
      )}
    </div>
  );
}
