export function UserSynonymsRow({ synonyms }: { synonyms: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium text-gray-500">User Synonyms</span>
      {synonyms.map((synonym) => (
        <span key={synonym} className="text-sm text-gray-900">
          {synonym}
        </span>
      ))}
      <button className="text-sm text-gray-400 hover:text-gray-600">+ Add Synonym</button>
    </div>
  );
}
