import type { PronunciationAudio, ContextSentence } from "./wanikani.ts";

export function selectRandomAudio(
  audios: PronunciationAudio[],
  gender: "male" | "female"
): PronunciationAudio | null {
  const filtered = audios.filter(
    (a) => a.metadata.gender === gender && a.content_type === "audio/mpeg"
  );
  if (filtered.length === 0) return null;
  return filtered[Math.floor(Math.random() * filtered.length)] ?? null;
}

export function getShortestSentence(sentences: ContextSentence[]): ContextSentence | null {
  if (sentences.length === 0) return null;
  return sentences.reduce((shortest, current) =>
    current.ja.length < shortest.ja.length ? current : shortest
  );
}

export type VoiceActor = PronunciationAudio["metadata"];

export function getUniqueVoiceActors(audios: PronunciationAudio[]): VoiceActor[] {
  const seen = new Set<number>();
  return audios
    .filter((audio) => {
      if (seen.has(audio.metadata.voice_actor_id)) return false;
      seen.add(audio.metadata.voice_actor_id);
      return true;
    })
    .map((audio) => audio.metadata);
}
