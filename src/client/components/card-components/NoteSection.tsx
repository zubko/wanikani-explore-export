import { useState } from "react";
import toast from "react-hot-toast";
import { Cancel01Icon, CheckmarkCircle01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import type { LocalStudyMaterial, LocalStudyMaterialNoteField } from "@/model/wanikani.ts";
import {
  saveLocalStudyMaterial,
  useLocalStudyMaterial,
} from "../../hooks/useLocalStudyMaterial.ts";
import { saveErrorMessage } from "../../utils/request-error.ts";
import { AddButton } from "./AddButton.tsx";
import { IconButton } from "./IconButton.tsx";

export type NoteSectionProps = {
  subjectId: number;
  field: LocalStudyMaterialNoteField;
  wanikaniNote: string;
  localStudyMaterial: LocalStudyMaterial | null;
};

export function NoteSection({
  subjectId,
  field,
  wanikaniNote,
  localStudyMaterial,
}: NoteSectionProps) {
  const record = useLocalStudyMaterial(subjectId, localStudyMaterial);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState("");

  // `||` and not `??`, to drop an empty note the same way `mergeStudyMaterial` does. The server
  // never writes one, a hand-edited file can hold one.
  const localNote = record?.[field] || null;
  const shownNote = localNote ?? wanikaniNote;

  const startEdit = () => {
    setDraft(shownNote);
    setMode("edit");
  };

  const cancel = () => {
    setDraft("");
    setMode("view");
  };

  const save = async () => {
    setMode("view");
    try {
      await saveLocalStudyMaterial({
        subjectId,
        fromServer: localStudyMaterial,
        patch: { [field]: draft.trim() },
      });
    } catch (err) {
      setMode("edit");
      toast.error(saveErrorMessage(err));
    }
  };

  if (mode === "edit") {
    return (
      <div>
        <NoteHeader />
        <textarea
          autoFocus
          value={draft}
          rows={Math.max(3, draft.split("\n").length)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") cancel();
            if (event.key === "Enter" && event.metaKey) void save();
          }}
          className="w-full rounded border border-gray-300 p-2 text-sm text-gray-700"
        />
        <div className="mt-1.5 flex gap-2">
          <IconButton icon={CheckmarkCircle01Icon} title="Save note" onClick={() => void save()} />
          <IconButton icon={Cancel01Icon} title="Cancel" onClick={cancel} />
        </div>
      </div>
    );
  }

  if (shownNote === "") {
    return (
      <div>
        <NoteHeader />
        <AddButton label="+ Add Note" onClick={startEdit} />
      </div>
    );
  }

  return (
    <div>
      <NoteHeader isLocal={localNote !== null}>
        <IconButton icon={PencilEdit01Icon} title="Edit note" onClick={startEdit} />
      </NoteHeader>
      <p className="text-sm whitespace-pre-wrap text-gray-700">{shownNote}</p>
    </div>
  );
}

function NoteHeader({ isLocal, children }: { isLocal?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <h4 className="text-sm font-medium text-gray-500">Note</h4>
      {isLocal && <span className="rounded bg-gray-100 px-1.5 text-xs text-gray-500">local</span>}
      {children}
    </div>
  );
}
