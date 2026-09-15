import { useState } from "react";
import toast from "react-hot-toast";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, CheckmarkCircle01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { api } from "../../api.ts";

export type NoteSectionProps = {
  subjectId: number;
  field: "meaning_note" | "reading_note";
  wanikaniNote: string;
  localNote: string | null;
};

export function NoteSection({ subjectId, field, wanikaniNote, localNote }: NoteSectionProps) {
  const [savedNote, setSavedNote] = useState(localNote);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const shownNote = savedNote ?? wanikaniNote;

  const startEdit = () => {
    setDraft(shownNote);
    setMode("edit");
  };

  const cancel = () => {
    setDraft("");
    setMode("view");
  };

  const save = async () => {
    if (saving) return;
    const trimmed = draft.trim();
    const previousNote = savedNote;
    setSavedNote(trimmed === "" ? null : trimmed);
    setMode("view");
    setSaving(true);
    try {
      await api.saveStudyMaterial(subjectId, { [field]: trimmed });
    } catch (err) {
      setSavedNote(previousNote);
      setMode("edit");
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
        <button
          type="button"
          onClick={startEdit}
          className="cursor-pointer text-sm text-gray-400 hover:text-gray-600"
        >
          + Add Note
        </button>
      </div>
    );
  }

  return (
    <div>
      <NoteHeader isLocal={savedNote !== null}>
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

function IconButton({
  icon,
  title,
  onClick,
}: {
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
    >
      <HugeiconsIcon icon={icon} size={16} />
    </button>
  );
}
