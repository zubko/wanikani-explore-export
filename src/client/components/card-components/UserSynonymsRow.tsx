import { useState } from "react";
import toast from "react-hot-toast";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { api } from "../../api.ts";

export type UserSynonymsRowProps = {
  subjectId: number;
  wanikaniSynonyms: string[];
  localSynonyms: string[];
};

export function UserSynonymsRow({
  subjectId,
  wanikaniSynonyms,
  localSynonyms,
}: UserSynonymsRowProps) {
  const [savedSynonyms, setSavedSynonyms] = useState(localSynonyms);
  const [mode, setMode] = useState<"view" | "add">("view");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (next: string[]) => {
    if (saving) return;
    const previousSynonyms = savedSynonyms;
    setSavedSynonyms(next);
    setSaving(true);
    try {
      await api.saveStudyMaterial(subjectId, { meaning_synonyms: next });
    } catch (err) {
      setSavedSynonyms(previousSynonyms);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    const trimmed = draft.trim();
    setDraft("");
    setMode("view");
    if (trimmed === "") return;
    if (wanikaniSynonyms.includes(trimmed) || savedSynonyms.includes(trimmed)) {
      toast.error(`"${trimmed}" is already a synonym`);
      return;
    }
    void save([...savedSynonyms, trimmed]);
  };

  const remove = (synonym: string) => {
    void save(savedSynonyms.filter((item) => item !== synonym));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-medium text-gray-500">User Synonyms</span>
      {wanikaniSynonyms.map((synonym) => (
        <span key={synonym} className="text-sm text-gray-900">
          {synonym}
        </span>
      ))}
      {savedSynonyms.map((synonym) => (
        <span
          key={synonym}
          className="flex items-center gap-1 rounded bg-gray-100 px-1.5 text-sm text-gray-900"
        >
          {synonym}
          <button
            type="button"
            title={`Remove ${synonym}`}
            onClick={() => remove(synonym)}
            className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
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
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setMode("add");
          }}
          className="cursor-pointer text-sm text-gray-400 hover:text-gray-600"
        >
          + Add Synonym
        </button>
      )}
    </div>
  );
}
