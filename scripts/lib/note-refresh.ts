export function pickNotesToRefresh<Note extends { characters: string }>(params: {
  notes: Note[];
  refreshed: ReadonlySet<string>;
  remaining: number | undefined;
}): Note[] {
  const { notes, refreshed, remaining } = params;
  const notRefreshed = notes.filter((note) => !refreshed.has(note.characters));
  return remaining === undefined ? notRefreshed : notRefreshed.slice(0, remaining);
}
