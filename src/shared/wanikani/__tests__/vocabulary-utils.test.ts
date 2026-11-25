import { describe, expect, it } from "bun:test";
import { selectReadingAudios } from "../vocabulary-utils.ts";
import type { PronunciationAudio } from "../wanikani.ts";

function audio(
  gender: "male" | "female",
  pronunciation: string,
  content_type: PronunciationAudio["content_type"] = "audio/mpeg"
): PronunciationAudio {
  return {
    url: `https://files.wanikani.com/${gender}-${pronunciation}-${content_type}`,
    content_type,
    metadata: {
      gender,
      source_id: 1,
      pronunciation,
      voice_actor_id: 1,
      voice_actor_name: "Test",
      voice_description: "",
    },
  };
}

const pyongyang = [
  audio("female", "ぴょんやん"),
  audio("female", "ぴょんやん", "audio/webm"),
  audio("female", "へいじょう", "audio/webm"),
  audio("female", "へいじょう"),
  audio("male", "へいじょう", "audio/webm"),
  audio("male", "へいじょう"),
  audio("male", "ぴょんやん", "audio/webm"),
  audio("male", "ぴょんやん"),
];

describe("selectReadingAudios", () => {
  it("returns one mp3 per reading of the gender, in the order of the readings", () => {
    const result = selectReadingAudios({
      audios: pyongyang,
      readings: ["ぴょんやん", "へいじょう"],
      gender: "male",
    });
    expect(result.map((a) => a.url)).toEqual([
      "https://files.wanikani.com/male-ぴょんやん-audio/mpeg",
      "https://files.wanikani.com/male-へいじょう-audio/mpeg",
    ]);
  });

  it("puts a reading that is not in the list last", () => {
    const result = selectReadingAudios({
      audios: pyongyang,
      readings: ["へいじょう"],
      gender: "female",
    });
    expect(result.map((a) => a.metadata.pronunciation)).toEqual(["へいじょう", "ぴょんやん"]);
  });

  it("keeps the first mp3 when a reading has several", () => {
    const first = audio("female", "おおや");
    const second = { ...audio("female", "おおや"), url: "https://files.wanikani.com/second" };
    const result = selectReadingAudios({
      audios: [first, second],
      readings: ["おおや"],
      gender: "female",
    });
    expect(result).toEqual([first]);
  });

  it("keeps the audio order when the readings list is empty", () => {
    const result = selectReadingAudios({ audios: pyongyang, readings: [], gender: "male" });
    expect(result.map((a) => a.metadata.pronunciation)).toEqual(["へいじょう", "ぴょんやん"]);
  });

  it("returns nothing without audio for the gender", () => {
    expect(
      selectReadingAudios({ audios: [audio("female", "かわ")], readings: ["かわ"], gender: "male" })
    ).toEqual([]);
  });
});
