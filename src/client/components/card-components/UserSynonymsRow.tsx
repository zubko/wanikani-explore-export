import { useState } from "react";
import toast from "react-hot-toast";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
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
  localStudyMaterial: LocalStudyMaterial | null;
  hint?: string;
};

export function UserSynonymsRow({
  subjectId,
  wanikaniSynonyms,
  localStudyMaterial,
  hint,
}: UserSynonymsRowProps) {
  const record = useLocalStudyMaterial(subjectId, localStudyMaterial);
  const [mode, setMode] = useState<"view" | "add">("view");
  const [draft, setDraft] = useState("");

  const localSynonyms = record?.meaning_synonyms ?? [];
  const ownSynonyms = localSynonyms.filter((synonym) => !wanikaniSynonyms.includes(synonym));

  // The whole list is sent, so it is built from the confirmed list when the request starts.
  // Built at click time it would carry a change of an earlier save that failed meanwhile.
  const save = async (nextList: (confirmed: string[]) => string[]) => {
    try {
      await saveLocalStudyMaterial({
        subjectId,
        fromServer: localStudyMaterial,
        patch: (current) => ({ meaning_synonyms: nextList(current?.meaning_synonyms ?? []) }),
      });
    } catch (err) {
      toast.error(saveErrorMessage(err));
    }
  };

  const add = () => {
    const trimmed = draft.trim();
    setDraft("");
    setMode("view");
    if (trimmed === "") return;
    if (wanikaniSynonyms.includes(trimmed) || localSynonyms.includes(trimmed)) {
      toast.error(`"${trimmed}" is already a synonym`);
      return;
    }
    void save((list) => (list.includes(trimmed) ? list : [...list, trimmed]));
  };

  const remove = (synonym: string) => {
    void save((list) => list.filter((item) => item !== synonym));
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
