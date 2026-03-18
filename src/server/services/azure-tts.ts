function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function generateSentenceAudio(text: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  const voices = process.env.AZURE_TTS_VOICES;

  if (!apiKey || !region || !voices) return null;
  if (!text.trim()) return null;

  const voiceList = voices.split(",").map((v) => v.trim());
  const voice = voiceList[Math.floor(Math.random() * voiceList.length)]!;
  const language = voice.split("-").slice(0, 2).join("-");

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const ssml = `<speak version='1.0' xml:lang='${language}'>
    <voice name='${voice}'>${escapeXml(text)}</voice>
  </speak>`;

  console.log(`[TTS] Generating audio for: ${text.slice(0, 50)}...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(could not read error body)");
    throw new Error(`Azure TTS error: ${response.status} - ${errorText}`);
  }

  const audio = await response.arrayBuffer();
  console.log(`[TTS] Generated ${(audio.byteLength / 1024).toFixed(1)} KB audio`);
  return audio;
}
