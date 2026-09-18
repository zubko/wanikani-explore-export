import { PlusSignCircleIcon } from "@hugeicons/core-free-icons";
import { IconButton } from "./IconButton.tsx";

export function AddToAnkiButton({ onClick }: { onClick: () => void }) {
  return <IconButton icon={PlusSignCircleIcon} title="Add to Anki" onClick={onClick} size={20} />;
}
