import type { FetchedMedia } from "@server/repository/media-cache.ts";
import { hashNumber, shortHash } from "@server/utils/hash.ts";

export type AzureTtsConfig = { key: string; region: string; voices: string[] };

export const SENTENCE_AUDIO_OUTPUT_FORMAT = "audio-24khz-160kbitrate-mono-mp3";

export function readAzureTtsConfig(): AzureTtsConfig {
  const key = readRequiredEnv("AZURE_TTS_KEY");
  const region = readRequiredEnv("AZURE_TTS_REGION");
  const voices = readRequiredEnv("AZURE_TTS_VOICES")
    .split(",")
    .map((voice) => voice.trim());
  // The list length picks the voice of each word, so a stray comma would rename most clips
  if (voices.includes("")) throw new Error("Empty voice in AZURE_TTS_VOICES in the root env file");
  return { key, region, voices };
}

/** The voice is part of the clip name, so one word must always get the same voice. */
export function pickSentenceVoice(voices: string[], slug: string): string {
  return voices[hashNumber(slug) % voices.length]!;
}

export function buildSentenceSsml(params: { text: string; voice: string }): string {
  const { text, voice } = params;
  const language = voice.split("-").slice(0, 2).join("-");
  return `<speak version='1.0' xml:lang='${language}'>
    <voice name='${voice}'>${escapeXml(text)}</voice>
  </speak>`;
}

/** The hash covers the output format and the SSML, so a change of either gives a new clip. */
export function sentenceAudioHash(ssml: string): string {
  return shortHash(`${SENTENCE_AUDIO_OUTPUT_FORMAT}\n${ssml}`);
}

export async function generateSentenceAudio(params: {
  ssml: string;
  config: AzureTtsConfig;
}): Promise<FetchedMedia> {
  const { ssml, config } = params;
  const { key, region } = config;
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  console.log(`[TTS] Generating audio from ${ssml.length} chars of SSML`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": SENTENCE_AUDIO_OUTPUT_FORMAT,
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(could not read error body)");
    throw new Error(`Azure TTS error: ${response.status} - ${errorText}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  console.log(`[TTS] Generated ${(data.length / 1024).toFixed(1)} KB audio`);
  return { data, extension: "mp3" };
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the root env file`);
  return value;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
