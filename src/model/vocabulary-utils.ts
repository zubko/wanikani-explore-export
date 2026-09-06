import type { PronunciationAudio, ContextSentence } from "./wanikani.ts";

export type VoiceActor = PronunciationAudio["metadata"];

export function selectReadingAudios(params: {
  audios: PronunciationAudio[];
  readings: string[];
  gender: "male" | "female";
}): PronunciationAudio[] {
  const { audios, readings, gender } = params;
  const firstPerReading = new Map<string, PronunciationAudio>();
  for (const audio of audios) {
    if (audio.metadata.gender !== gender || audio.content_type !== "audio/mpeg") continue;
    const reading = audio.metadata.pronunciation;
    if (!firstPerReading.has(reading)) firstPerReading.set(reading, audio);
  }
  return [...firstPerReading.values()].sort(
    (a, b) => readingRank(readings, a) - readingRank(readings, b)
  );
}

export function getShortestSentence(sentences: ContextSentence[]): ContextSentence | null {
  if (sentences.length === 0) return null;
  return sentences.reduce((shortest, current) =>
    current.ja.length < shortest.ja.length ? current : shortest
  );
}

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

function readingRank(readings: string[], audio: PronunciationAudio): number {
  const index = readings.indexOf(audio.metadata.pronunciation);
  return index === -1 ? readings.length : index;
}
