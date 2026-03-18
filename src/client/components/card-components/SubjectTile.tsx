type SubjectTileProps = {
  characters: string;
  reading: string;
  meaning: string;
  color: string;
  onClick: () => void;
};

export function SubjectTile({ characters, reading, meaning, color, onClick }: SubjectTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col items-center rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-100"
    >
      <div
        className="mb-1.5 flex h-12 min-w-12 items-center justify-center rounded-lg px-2 text-xl text-white"
        style={{ backgroundColor: color }}
      >
        {characters}
      </div>
      <span className="text-sm text-gray-600">{reading}</span>
      <span className="text-sm font-medium text-gray-900">{meaning}</span>
    </button>
  );
}
