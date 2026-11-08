import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { createFetchMock, resolveUrl } from "@/test/fetch-utils.ts";
import {
  buildSpeechSsml,
  generateSpeechAudio,
  pickVoice,
  readAzureTtsConfig,
  speechAudioHash,
  SPEECH_AUDIO_OUTPUT_FORMAT,
  type AzureTtsConfig,
} from "@server/services/azure-tts.ts";

type RecordedRequest = { url: string; method?: string; headers: Headers; body?: string };

const ENV_NAMES = [
  "AZURE_TTS_KEY",
  "AZURE_TTS_REGION",
  "AZURE_TTS_FEMALE_VOICES",
  "AZURE_TTS_MALE_VOICES",
  "AZURE_TTS_VOICES",
];
const FEMALE_VOICES = ["ja-JP-Nanami:DragonHDLatestNeural", "ja-JP-Mayu:DragonHDLatestNeural"];
const MALE_VOICES = ["ja-JP-Masaru:DragonHDLatestNeural"];
const VOICES = [...FEMALE_VOICES, ...MALE_VOICES];
const CONFIG: AzureTtsConfig = {
  key: "secret-key",
  region: "westeurope",
  voices: VOICES,
  voicesByGender: { female: FEMALE_VOICES, male: MALE_VOICES },
};

// Other test files install their own fetch mock, so this is not the real fetch
const previousFetch = globalThis.fetch;

const defaultAnswer = () => new Response(new ArrayBuffer(100), { status: 200 });

let requests: RecordedRequest[] = [];
let answer = defaultAnswer;
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
  process.env.AZURE_TTS_KEY = CONFIG.key;
  process.env.AZURE_TTS_REGION = CONFIG.region;
  process.env.AZURE_TTS_FEMALE_VOICES = FEMALE_VOICES.join(", ");
  process.env.AZURE_TTS_MALE_VOICES = MALE_VOICES.join(", ");
  delete process.env.AZURE_TTS_VOICES;
  requests = [];
  answer = defaultAnswer;
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
  test("reads the values and splits both voice lists, female voices first", () => {
    expect(readAzureTtsConfig()).toEqual(CONFIG);
  });

  test("throws with the name of the first missing variable", () => {
    delete process.env.AZURE_TTS_REGION;
    delete process.env.AZURE_TTS_MALE_VOICES;
    expect(() => readAzureTtsConfig()).toThrow("Missing AZURE_TTS_REGION in the root env file");
  });

  test("an empty value counts as missing", () => {
    process.env.AZURE_TTS_KEY = "";
    expect(() => readAzureTtsConfig()).toThrow("Missing AZURE_TTS_KEY in the root env file");
  });

  test("each gender needs a voice list", () => {
    for (const name of ["AZURE_TTS_FEMALE_VOICES", "AZURE_TTS_MALE_VOICES"]) {
      const value = process.env[name];
      delete process.env[name];
      expect(() => readAzureTtsConfig()).toThrow(`Missing ${name} in the root env file`);
      process.env[name] = value;
    }
  });

  test("an empty entry in a voice list is refused", () => {
    const [male] = MALE_VOICES;
    const otherMale = "ja-JP-Keita:DragonHDLatestNeural";
    for (const voices of [`${male},`, `${male},,${otherMale}`, ` , ${male}`]) {
      process.env.AZURE_TTS_MALE_VOICES = voices;
      expect(() => readAzureTtsConfig()).toThrow(
        "Empty voice in AZURE_TTS_MALE_VOICES in the root env file"
      );
    }
  });

  test("a voice in both lists is refused", () => {
    process.env.AZURE_TTS_MALE_VOICES = `${MALE_VOICES[0]},${FEMALE_VOICES[1]}`;
    expect(() => readAzureTtsConfig()).toThrow(
      `Voice ${FEMALE_VOICES[1]} is in both AZURE_TTS_FEMALE_VOICES and AZURE_TTS_MALE_VOICES in the root env file`
    );
  });

  test("the old AZURE_TTS_VOICES list fails, with or without the new lists", () => {
    const message =
      "AZURE_TTS_VOICES is no longer read. Put the female voices in AZURE_TTS_FEMALE_VOICES " +
      "and the male voices in AZURE_TTS_MALE_VOICES, then remove AZURE_TTS_VOICES from the root env file";
    process.env.AZURE_TTS_VOICES = VOICES.join(",");
    expect(() => readAzureTtsConfig()).toThrow(message);

    delete process.env.AZURE_TTS_FEMALE_VOICES;
    delete process.env.AZURE_TTS_MALE_VOICES;
    expect(() => readAzureTtsConfig()).toThrow(message);
  });
});

describe("pickVoice", () => {
  test("gives one slug the same voice every time", () => {
    const voice = pickVoice(VOICES, "毎晩");
    expect(VOICES).toContain(voice);
    expect(pickVoice(VOICES, "毎晩")).toBe(voice);
  });

  test("uses every voice over a set of slugs", () => {
    const slugs = ["毎晩", "入る", "平壌", "高校", "ここ", "実る", "人", "大人", "下す", "どうぞ"];
    const usedVoices = new Set(slugs.map((slug) => pickVoice(VOICES, slug)));
    expect([...usedVoices].sort()).toEqual([...VOICES].sort());
  });
});

describe("buildSpeechSsml", () => {
  test("escapes the text and holds the voice name and its language", () => {
    const ssml = buildSpeechSsml({ text: "A < B & C", voice: VOICES[0]! });
    expect(ssml).toMatchInlineSnapshot(`
      "<speak version='1.0' xml:lang='ja-JP'>
          <voice name='ja-JP-Nanami:DragonHDLatestNeural'>A &lt; B &amp; C</voice>
        </speak>"
    `);
  });
});

describe("speechAudioHash", () => {
  test("gives one SSML the same hash and another voice a new one", () => {
    const ssml = buildSpeechSsml({ text: "毎晩", voice: VOICES[0]! });
    const otherVoiceSsml = buildSpeechSsml({ text: "毎晩", voice: VOICES[1]! });

    expect(speechAudioHash(ssml)).toMatch(/^[0-9a-f]{8}$/);
    expect(speechAudioHash(ssml)).toBe(speechAudioHash(ssml));
    expect(speechAudioHash(otherVoiceSsml)).not.toBe(speechAudioHash(ssml));
  });
});

describe("generateSpeechAudio", () => {
  test("posts the SSML with the three headers and answers an mp3", async () => {
    const ssml = buildSpeechSsml({ text: "毎晩", voice: VOICES[0]! });

    const media = await generateSpeechAudio({ ssml, config: CONFIG });

    expect(media.extension).toBe("mp3");
    expect(media.data.length).toBe(100);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe(ssml);
    expect(Object.fromEntries(request?.headers ?? [])).toEqual({
      "ocp-apim-subscription-key": CONFIG.key,
      "content-type": "application/ssml+xml",
      "x-microsoft-outputformat": SPEECH_AUDIO_OUTPUT_FORMAT,
    });
  });

  test("a bad status throws with the status and the answer text", async () => {
    answer = () => new Response("Quota exceeded", { status: 429 });
    const ssml = buildSpeechSsml({ text: "毎晩", voice: VOICES[0]! });

    await expect(generateSpeechAudio({ ssml, config: CONFIG })).rejects.toThrow(
      "Azure TTS error: 429 - Quota exceeded"
    );
  });
});
