import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignCircleIcon } from "@hugeicons/core-free-icons";

export function AddToAnkiButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-gray-400 transition-colors hover:text-gray-600"
      title="Add to Anki"
    >
      <HugeiconsIcon icon={PlusSignCircleIcon} size={20} />
    </button>
  );
}
