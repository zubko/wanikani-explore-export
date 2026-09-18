import { HugeiconsIcon } from "@hugeicons/react";
import { Link02Icon } from "@hugeicons/core-free-icons";
import { ICON_BUTTON_CLASS } from "./IconButton.tsx";

export function WanikaniLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={ICON_BUTTON_CLASS}>
      <HugeiconsIcon icon={Link02Icon} size={20} />
    </a>
  );
}
