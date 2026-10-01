import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";
import {
  buildSentenceSsml,
  generateSentenceAudio,
  pickSentenceVoice,
  readAzureTtsConfig,
} from "@server/services/azure-tts.ts";

type RecordedRequest = { url: string; method?: string; headers: Headers; body?: string };

const ENV_NAMES = ["AZURE_TTS_KEY", "AZURE_TTS_REGION", "AZURE_TTS_VOICES"];
const VOICES = ["ja-JP-Nanami:DragonHDLatestNeural", "ja-JP-Masaru:DragonHDLatestNeural"];

// Other test files install their own fetch mock, so this is not the real fetch
const previousFetch = globalThis.fetch;

let requests: RecordedRequest[] = [];
let answer = () => new Response(new ArrayBuffer(100), { status: 200 });
let savedEnv: Record<string, string | undefined> = {};

globalThis.fetch = createFetchMock(async (input, init) => {
  requests.push({
    url: resolveUrl(input),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: typeof init?.body === "string" ? init.body : undefined,
  });
  return answer();
});

// process.env is shared by every test file of the run
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  process.env.AZURE_TTS_KEY = "secret-key";
  process.env.AZURE_TTS_REGION = "westeurope";
  process.env.AZURE_TTS_VOICES = VOICES.join(", ");
  requests = [];
  answer = () => new Response(new ArrayBuffer(100), { status: 200 });
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = savedEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

afterAll(() => {
  globalThis.fetch = previousFetch;
});

describe("readAzureTtsConfig", () => {
  test("reads the three values and splits the voice list", () => {
    expect(readAzureTtsConfig()).toEqual({
      key: "secret-key",
      region: "westeurope",
      voices: VOICES,
    });
  });

  test("throws with the name of the first missing variable", () => {
    delete process.env.AZURE_TTS_REGION;
    delete process.env.AZURE_TTS_VOICES;
    expect(() => readAzureTtsConfig()).toThrow("Missing AZURE_TTS_REGION in the root env file");
  });

  test("an empty value counts as missing", () => {
    process.env.AZURE_TTS_KEY = "";
    expect(() => readAzureTtsConfig()).toThrow("Missing AZURE_TTS_KEY in the root env file");
  });
});

describe("pickSentenceVoice", () => {
  test("gives one slug the same voice every time", () => {
    const voice = pickSentenceVoice(VOICES, "毎晩");
    expect(VOICES).toContain(voice);
    expect(pickSentenceVoice(VOICES, "毎晩")).toBe(voice);
  });

  test("uses both voices over a set of slugs", () => {
    const slugs = ["毎晩", "入る", "平壌", "高校", "ここ", "実る", "人", "大人"];
    const usedVoices = new Set(slugs.map((slug) => pickSentenceVoice(VOICES, slug)));
    expect([...usedVoices].sort()).toEqual([...VOICES].sort());
  });
});

describe("buildSentenceSsml", () => {
  test("escapes the text and holds the voice name and its language", () => {
    const ssml = buildSentenceSsml({ text: "A < B & C", voice: VOICES[0]! });
    expect(ssml).toMatchInlineSnapshot(`
      "<speak version='1.0' xml:lang='ja-JP'>
          <voice name='ja-JP-Nanami:DragonHDLatestNeural'>A &lt; B &amp; C</voice>
        </speak>"
    `);
  });
});

describe("generateSentenceAudio", () => {
  test("posts the SSML with the three headers and answers an mp3", async () => {
    const ssml = buildSentenceSsml({ text: "毎晩", voice: VOICES[0]! });

    const media = await generateSentenceAudio(ssml);

    expect(media.extension).toBe("mp3");
    expect(media.data.length).toBe(100);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe(ssml);
    expect(Object.fromEntries(request?.headers ?? [])).toEqual({
      "ocp-apim-subscription-key": "secret-key",
      "content-type": "application/ssml+xml",
      "x-microsoft-outputformat": "audio-24khz-160kbitrate-mono-mp3",
    });
  });

  test("a bad status throws with the status and the answer text", async () => {
    answer = () => new Response("Quota exceeded", { status: 429 });
    const ssml = buildSentenceSsml({ text: "毎晩", voice: VOICES[0]! });

    await expect(generateSentenceAudio(ssml)).rejects.toThrow(
      "Azure TTS error: 429 - Quota exceeded"
    );
  });

  test("a missing variable throws before any request", async () => {
    delete process.env.AZURE_TTS_KEY;
    const ssml = buildSentenceSsml({ text: "毎晩", voice: VOICES[0]! });

    await expect(generateSentenceAudio(ssml)).rejects.toThrow("Missing AZURE_TTS_KEY");
    expect(requests).toEqual([]);
  });
});
