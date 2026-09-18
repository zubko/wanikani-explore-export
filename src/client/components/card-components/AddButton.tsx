type AddButtonProps = {
  label: string;
  onClick: () => void;
};

export function AddButton({ label, onClick }: AddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-sm text-gray-400 hover:text-gray-600"
    >
      {label}
    </button>
  );
}
