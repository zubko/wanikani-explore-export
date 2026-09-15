import toast from "react-hot-toast";
import type {
  Vocabulary,
  KanaVocabulary,
  Kanji,
  ContextSentence,
  PronunciationAudio,
  VocabularyReading,
  Conjugations,
} from "@/model/wanikani.ts";
import { getPrimaryMeaning, getPrimaryReading } from "@/model/subject-utils.ts";
import { getUniqueVoiceActors, type VoiceActor } from "@/model/vocabulary-utils.ts";
import { subjectColors } from "@/config/theme.ts";
import { AddToAnkiButton } from "./card-components/AddToAnkiButton.tsx";
import { CardHeader } from "./card-components/CardHeader.tsx";
import { ExplanationBlock } from "./card-components/ExplanationBlock.tsx";
import { LabeledRow } from "./card-components/LabeledRow.tsx";
import { NoteSection, type NoteSectionProps } from "./card-components/NoteSection.tsx";
import { scrollToElement } from "../utils/scroll-to-element.ts";
import { SectionTitle } from "./card-components/SectionTitle.tsx";
import { SubjectTile } from "./card-components/SubjectTile.tsx";
import { UserSynonymsRow, type UserSynonymsRowProps } from "./card-components/UserSynonymsRow.tsx";
import { api } from "../api.ts";
import { formatAnkiResult } from "../utils/format-anki-result.ts";
import { noteProps, synonymProps } from "../utils/study-material-props.ts";
import { HugeiconsIcon } from "@hugeicons/react";
import { VolumeHighIcon } from "@hugeicons/core-free-icons";

type VocabularyCardProps = {
  vocabulary: Vocabulary | KanaVocabulary;
};

export function VocabularyCard({ vocabulary }: VocabularyCardProps) {
  const primaryMeaning = getPrimaryMeaning(vocabulary.meanings);
  const isRegularVocab = vocabulary.object === "vocabulary";
  const vocabData = isRegularVocab ? (vocabulary as Vocabulary) : null;

  const handleAddToAnki = () => {
    const kanjiCount = vocabData ? vocabData.componentKanji.length : 0;
    toast.promise(api.addToAnki(vocabulary.id, vocabulary.object), {
      loading:
        kanjiCount > 0
          ? `Adding ${vocabulary.characters} with ${kanjiCount} kanji...`
          : `Adding ${vocabulary.characters}...`,
      success: (result) => formatAnkiResult(result),
      error: (err) => `Failed: ${err.message}`,
    });
  };

  return (
    <div className="rounded-lg bg-white shadow">
      <CardHeader
        subjectType="vocabulary"
        title={primaryMeaning}
        character={vocabulary.characters}
        documentUrl={vocabulary.documentUrl}
        actions={<AddToAnkiButton onClick={handleAddToAnki} />}
      />
      <div className="divide-y divide-gray-200">
        {vocabData && <KanjiCompositionSection componentKanji={vocabData.componentKanji} />}
        <MeaningSection
          meanings={vocabulary.meanings}
          synonyms={synonymProps(vocabulary)}
          partsOfSpeech={vocabulary.partsOfSpeech}
          conjugations={vocabData?.conjugations ?? null}
          mnemonic={vocabulary.meaningMnemonic}
          note={noteProps(vocabulary, "meaning_note")}
        />
        {vocabData && (
          <ReadingSection
            readings={vocabData.readings}
            audios={vocabulary.pronunciationAudios}
            mnemonic={vocabData.readingMnemonic}
            note={noteProps(vocabulary, "reading_note")}
          />
        )}
        <ContextSentencesSection sentences={vocabulary.contextSentences} />
      </div>
    </div>
  );
}

function MeaningSection({
  meanings,
  synonyms,
  partsOfSpeech,
  conjugations,
  mnemonic,
  note,
}: {
  meanings: { meaning: string; primary: boolean; accepted_answer: boolean }[];
  synonyms: UserSynonymsRowProps;
  partsOfSpeech: string[];
  conjugations: Conjugations | null;
  mnemonic: string;
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
        <LabeledRow label="Word Type" value={partsOfSpeech.join(", ")} />
        {conjugations && <ConjugationsRow conjugations={conjugations} />}
        <ExplanationBlock mnemonic={mnemonic} />
        <NoteSection {...note} />
      </div>
    </div>
  );
}

function ReadingSection({
  readings,
  audios,
  mnemonic,
  note,
}: {
  readings: VocabularyReading[];
  audios: PronunciationAudio[];
  mnemonic: string;
  note: NoteSectionProps;
}) {
  const primaryReading = getPrimaryReading(readings);

  return (
    <div className="p-4">
      <SectionTitle>Reading</SectionTitle>
      <div className="space-y-3">
        <p className="text-2xl">{primaryReading}</p>
        <AudioButtons audios={audios} />
        <ExplanationBlock mnemonic={mnemonic} />
        <NoteSection {...note} />
      </div>
    </div>
  );
}

function AudioButtons({ audios }: { audios: PronunciationAudio[] }) {
  const voiceActors = getUniqueVoiceActors(audios);

  if (voiceActors.length === 0) return null;

  return (
    <div className="flex gap-2">
      {voiceActors.map((actor) => (
        <AudioButton key={actor.voice_actor_id} actor={actor} audios={audios} />
      ))}
    </div>
  );
}

function AudioButton({ actor, audios }: { actor: VoiceActor; audios: PronunciationAudio[] }) {
  const handleClick = () => {
    const audio = audios.find(
      (a) => a.metadata.voice_actor_id === actor.voice_actor_id && a.content_type === "audio/mpeg"
    );
    if (audio) {
      new Audio(audio.url).play();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex cursor-pointer items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
    >
      <HugeiconsIcon icon={VolumeHighIcon} size={16} />
      <span className="font-medium uppercase">{actor.voice_actor_name}</span>
      <span className="text-xs text-gray-400">
        ({actor.voice_description.toUpperCase()}, {actor.gender === "female" ? "FEMALE" : "MALE"})
      </span>
    </button>
  );
}

function ContextSentencesSection({ sentences }: { sentences: ContextSentence[] }) {
  if (sentences.length === 0) return null;

  return (
    <div className="p-4">
      <SectionTitle>Context Sentences</SectionTitle>
      <div className="space-y-3">
        {sentences.map((sentence, index) => (
          <div key={index} className="space-y-1">
            <p className="text-base text-gray-900">{sentence.ja}</p>
            {sentence.reading && <p className="text-sm text-gray-400">{sentence.reading}</p>}
            <p className="text-sm text-gray-500">{sentence.en}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function KanjiCompositionSection({ componentKanji }: { componentKanji: Kanji[] }) {
  if (componentKanji.length === 0) return null;

  return (
    <div className="p-4">
      <SectionTitle>Kanji Composition</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {componentKanji.map((kanjiItem) => (
          <SubjectTile
            key={kanjiItem.id}
            characters={kanjiItem.characters}
            reading={getPrimaryReading(kanjiItem.readings)}
            meaning={getPrimaryMeaning(kanjiItem.meanings)}
            color={subjectColors.kanji}
            onClick={() => scrollToElement(`kanji-${kanjiItem.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

function ConjugationsRow({ conjugations }: { conjugations: Conjugations }) {
  const forms = [conjugations.dictionary, conjugations.masu, conjugations.te, conjugations.nai];
  return <LabeledRow label="Conjugations" value={forms.join(", ")} />;
}
