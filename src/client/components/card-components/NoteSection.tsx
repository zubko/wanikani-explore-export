export function NoteSection({ note }: { note: string | null }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-medium text-gray-500">Note</h4>
      {note ? (
        <p className="text-sm text-gray-700">{note}</p>
      ) : (
        <button className="text-sm text-gray-400 hover:text-gray-600">+ Add Note</button>
      )}
    </div>
  );
}
