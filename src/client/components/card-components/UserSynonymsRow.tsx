import { useState } from "react";
import toast from "react-hot-toast";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { LocalStudyMaterial, LocalStudyMaterialPatch } from "@/model/wanikani.ts";
import {
  saveLocalStudyMaterial,
  useLocalStudyMaterial,
} from "../../hooks/useLocalStudyMaterial.ts";
import { saveErrorMessage } from "../../utils/request-error.ts";
import { AddButton } from "./AddButton.tsx";
import { IconButton } from "./IconButton.tsx";

export type UserSynonymsRowProps = {
  subjectId: number;
  wanikaniSynonyms: string[];
  subjectMeanings: string[];
  localStudyMaterial: LocalStudyMaterial | null;
  hint?: string;
};

export function UserSynonymsRow({
  subjectId,
  wanikaniSynonyms,
  subjectMeanings,
  localStudyMaterial,
  hint,
}: UserSynonymsRowProps) {
  const record = useLocalStudyMaterial(subjectId, localStudyMaterial);
  const [mode, setMode] = useState<"view" | "add">("view");
  const [draft, setDraft] = useState("");

  const localSynonyms = record?.meaning_synonyms ?? [];
  const ownSynonyms = localSynonyms.filter((synonym) => !wanikaniSynonyms.includes(synonym));

  const save = async (patch: LocalStudyMaterialPatch) => {
    try {
      await saveLocalStudyMaterial({ subjectId, fromServer: localStudyMaterial, patch }).done;
    } catch (err) {
      toast.error(saveErrorMessage(err));
    }
  };

  const add = () => {
    const trimmed = draft.trim();
    setDraft("");
    setMode("view");
    if (trimmed === "") return;
    if (hasWord([...wanikaniSynonyms, ...localSynonyms], trimmed)) {
      toast.error(`"${trimmed}" is already a synonym`);
      return;
    }
    // subjectMeanings also holds blacklist auxiliary meanings, which are wrong answers,
    // so the message must not call them meanings.
    if (hasWord(subjectMeanings, trimmed)) {
      toast.error(`"${trimmed}" is already listed on WaniKani`);
      return;
    }
    void save({ add_synonym: trimmed });
  };

  const remove = (synonym: string) => {
    void save({ remove_synonym: synonym });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-medium text-gray-500">User Synonyms</span>
      {wanikaniSynonyms.map((synonym) => (
        <span key={`wanikani-${synonym}`} className="text-sm text-gray-900">
          {synonym}
        </span>
      ))}
      {ownSynonyms.map((synonym) => (
        <span
          key={`local-${synonym}`}
          className="flex items-center gap-1 rounded bg-gray-100 px-1.5 text-sm text-gray-900"
        >
          {synonym}
          <IconButton
            icon={Cancel01Icon}
            title={`Remove ${synonym}`}
            onClick={() => remove(synonym)}
            size={12}
          />
        </span>
      ))}
      {mode === "add" ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft("");
              setMode("view");
            }
            if (event.key === "Enter") add();
          }}
          className="w-32 rounded border border-gray-300 px-1.5 text-sm text-gray-900"
        />
      ) : (
        <AddButton
          label="+ Add Synonym"
          onClick={() => {
            setDraft("");
            setMode("add");
          }}
        />
      )}
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

// WaniKani stores some meanings decomposed, so 旧姓 has "Née" with a combining accent.
// Without NFC the same word typed precomposed looks different and slips through.
function hasWord(words: string[], word: string): boolean {
  const wanted = plainForm(word);
  return words.some((item) => plainForm(item) === wanted);
}

function plainForm(word: string): string {
  return word.trim().toLowerCase().normalize("NFC");
}
