import { HugeiconsIcon } from "@hugeicons/react";

type IconButtonProps = {
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  title: string;
  onClick: () => void;
  size?: number;
};

export const ICON_BUTTON_CLASS =
  "cursor-pointer text-gray-400 transition-colors hover:text-gray-600";

export function IconButton({ icon, title, onClick, size = 16 }: IconButtonProps) {
  return (
    <button type="button" onClick={onClick} title={title} className={ICON_BUTTON_CLASS}>
      <HugeiconsIcon icon={icon} size={size} />
    </button>
  );
}
