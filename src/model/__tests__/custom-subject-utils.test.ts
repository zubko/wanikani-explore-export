import { describe, expect, it } from "bun:test";
import {
  buildCustomRecord,
  buildCustomWordsByKanji,
  findCustomSubject,
  findWaniKaniClash,
  isCustomSubjectId,
  needsConjugations,
  nextCustomSubjectId,
  validateCustomSubjectInput,
  validateCustomSubjectRecord,
  validateCustomSubjects,
} from "../custom-subject-utils.ts";
import { ValidationError } from "../validation-error.ts";
import { CUSTOM_SUBJECT_ID_FLOOR } from "../wanikani.ts";
import type { CustomSubject, CustomSubjectInput } from "../wanikani.ts";

const KANJI_ID = 450;
const OTHER_KANJI_ID = 451;
const PERSON_KANJI_ID = 444;
const REPEATER_KANJI_ID = 856;
const SUN_KANJI_ID = 476;
const WEEKDAY_KANJI_ID = 961;
const KANJI_CHARACTERS_BY_ID = new Map([
  [KANJI_ID, "上"],
  [OTHER_KANJI_ID, "下"],
  [PERSON_KANJI_ID, "人"],
  [REPEATER_KANJI_ID, "々"],
  [SUN_KANJI_ID, "日"],
  [WEEKDAY_KANJI_ID, "曜"],
]);
const NOW = "2026-11-05T10:00:00.000Z";

const kanaInput = {
  object: "kana_vocabulary",
  data: {
    characters: "どうぞ",
    meanings: [{ meaning: "Please", primary: true, accepted_answer: true }],
    auxiliary_meanings: [{ meaning: "Go Ahead", type: "whitelist" }],
    parts_of_speech: ["adverb"],
    meaning_mnemonic: "You hold the door: <vocabulary>please</vocabulary>, go ahead.",
    context_sentences: [
      { en: "Please come in.", ja: "どうぞ入って。", reading: "どうぞはいって。" },
    ],
  },
} satisfies CustomSubjectInput;

const kanaVerbInput = {
  object: "kana_vocabulary",
  data: {
    characters: "くれる",
    meanings: [{ meaning: "To Give Me", primary: true, accepted_answer: true }],
    auxiliary_meanings: [],
    parts_of_speech: ["ichidan verb"],
    meaning_mnemonic: "Someone gives something to you.",
    context_sentences: [],
    conjugations: { dictionary: "くれる", masu: "くれます", te: "くれて", nai: "くれない" },
  },
} satisfies CustomSubjectInput;

const vocabularyInput = {
  object: "vocabulary",
  data: {
    characters: "上がる",
    meanings: [{ meaning: "To Rise", primary: true, accepted_answer: true }],
    auxiliary_meanings: [],
    parts_of_speech: ["godan verb"],
    meaning_mnemonic: "Something goes up.",
    context_sentences: [],
    conjugations: { dictionary: "上がる", masu: "上がります", te: "上がって", nai: "上がらない" },
    readings: [
      { reading: "のぼる", primary: false, accepted_answer: false },
      { reading: "あがる", primary: true, accepted_answer: true },
    ],
    reading_mnemonic: "The kun'yomi of the kanji.",
    component_subject_ids: [KANJI_ID],
  },
} satisfies CustomSubjectInput;

function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
}

function hide(record: CustomSubject): CustomSubject {
  const copy = structuredClone(record);
  copy.data.hidden_at = NOW;
  return copy;
}

describe("isCustomSubjectId", () => {
  it("takes an integer at or above the floor", () => {
    expect(isCustomSubjectId(CUSTOM_SUBJECT_ID_FLOOR)).toBe(true);
    expect(isCustomSubjectId(CUSTOM_SUBJECT_ID_FLOOR + 1)).toBe(true);
    expect(isCustomSubjectId(CUSTOM_SUBJECT_ID_FLOOR - 1)).toBe(false);
    expect(isCustomSubjectId(CUSTOM_SUBJECT_ID_FLOOR + 0.5)).toBe(false);
  });
});

describe("needsConjugations", () => {
  it("is true for an ichidan and a godan verb only", () => {
    expect(needsConjugations(["ichidan verb"])).toBe(true);
    expect(needsConjugations(["godan verb", "intransitive verb"])).toBe(true);
    expect(needsConjugations(["noun", "する verb"])).toBe(false);
  });
});

describe("validateCustomSubjectInput", () => {
  function check(
    input: unknown,
    kanjiCharactersById: ReadonlyMap<number, string> | null = KANJI_CHARACTERS_BY_ID
  ) {
    return () => validateCustomSubjectInput({ input, kanjiCharactersById });
  }

  function withData(base: { object: string; data: object }, data: Record<string, unknown>) {
    return { ...base, data: { ...base.data, ...data } };
  }

  function withoutField(base: { object: string; data: object }, field: string) {
    const data: Record<string, unknown> = { ...base.data };
    delete data[field];
    return { ...base, data };
  }

  it("accepts a kana word, a kana verb and a vocabulary word", () => {
    expect(check(kanaInput)).not.toThrow();
    expect(check(kanaVerbInput)).not.toThrow();
    expect(check(vocabularyInput)).not.toThrow();
  });

  it("refuses a wrong object", () => {
    expect(check({ ...kanaInput, object: "kanji" })).toThrow(
      new ValidationError("object must be vocabulary or kana_vocabulary")
    );
  });

  it("refuses an unknown key at the top and in data", () => {
    expect(check({ ...kanaInput, id: 5 })).toThrow(new ValidationError("id is not a known field"));
    expect(check(withData(kanaInput, { level: 0 }))).toThrow(
      new ValidationError("data.level is not a known field")
    );
  });

  it("refuses readings and a kanji on a kana word", () => {
    expect(check(withData(kanaInput, { readings: vocabularyInput.data.readings }))).toThrow(
      new ValidationError("data.readings is not allowed on a kana_vocabulary")
    );
    expect(check(withData(kanaInput, { characters: "上がる" }))).toThrow(
      new ValidationError("data.characters must hold no kanji on a kana_vocabulary")
    );
  });

  it("refuses a vocabulary word without readings or with two primary readings", () => {
    expect(check(withoutField(vocabularyInput, "readings"))).toThrow(
      new ValidationError("data.readings must be an array")
    );
    const twoPrimary = vocabularyInput.data.readings.map((r) => ({ ...r, primary: true }));
    expect(check(withData(vocabularyInput, { readings: twoPrimary }))).toThrow(
      new ValidationError("data.readings must have exactly one primary, it has 2")
    );
  });

  it("refuses a primary reading or a primary meaning that is not an accepted answer", () => {
    const rejectedReading = vocabularyInput.data.readings.map((r) => ({
      ...r,
      accepted_answer: false,
    }));
    expect(check(withData(vocabularyInput, { readings: rejectedReading }))).toThrow(
      new ValidationError("data.readings[1].accepted_answer must be true on the primary")
    );
    const rejectedMeaning = [{ meaning: "Please", primary: true, accepted_answer: false }];
    expect(check(withData(kanaInput, { meanings: rejectedMeaning }))).toThrow(
      new ValidationError("data.meanings[0].accepted_answer must be true on the primary")
    );
  });

  it("refuses a vocabulary word with no kanji id or with no kanji in the characters", () => {
    expect(check(withData(vocabularyInput, { component_subject_ids: [] }))).toThrow(
      new ValidationError("data.component_subject_ids must not be empty")
    );
    expect(check(withData(vocabularyInput, { characters: "あがる" }))).toThrow(
      new ValidationError("data.characters must hold at least one kanji")
    );
  });

  it("refuses an unknown kanji id, and skips that rule with no kanji list", () => {
    const input = withData(vocabularyInput, { component_subject_ids: [KANJI_ID, 999] });

    expect(check(input)).toThrow(
      new ValidationError("data.component_subject_ids[1] 999 is not a visible WaniKani kanji")
    );
    expect(check(input, null)).not.toThrow();
  });

  it("asks for conjugations on a godan verb of either type", () => {
    expect(check(withoutField(vocabularyInput, "conjugations"))).toThrow(
      new ValidationError("data.conjugations is required for an ichidan or godan verb")
    );
    const kanaGodan = withData(withoutField(kanaVerbInput, "conjugations"), {
      parts_of_speech: ["godan verb"],
    });
    expect(check(kanaGodan)).toThrow(
      new ValidationError("data.conjugations is required for an ichidan or godan verb")
    );
  });

  it("accepts conjugations on a noun", () => {
    expect(
      check(withData(kanaInput, { conjugations: kanaVerbInput.data.conjugations }))
    ).not.toThrow();
  });

  it("refuses a missing meaning mnemonic and a sentence with no reading", () => {
    expect(check(withoutField(kanaInput, "meaning_mnemonic"))).toThrow(
      new ValidationError("data.meaning_mnemonic must be a non-empty string")
    );
    expect(
      check(withData(kanaInput, { context_sentences: [{ en: "Please.", ja: "どうぞ。" }] }))
    ).toThrow(new ValidationError("data.context_sentences[0].reading must be a non-empty string"));
  });

  it("refuses characters with a slash, a space or Latin letters", () => {
    for (const characters of ["どう/ぞ", "どう ぞ", "どうzo"]) {
      expect(check(withData(kanaInput, { characters }))).toThrow(
        new ValidationError("data.characters must hold only kana, kanji, ー and 々")
      );
    }
  });

  it("accepts ー, a kanji with 々, and 々 on a kana word", () => {
    expect(check(withData(kanaInput, { characters: "コーヒー" }))).not.toThrow();
    expect(
      check(
        withData(vocabularyInput, {
          characters: "人々",
          component_subject_ids: [PERSON_KANJI_ID, REPEATER_KANJI_ID],
        })
      )
    ).not.toThrow();
  });

  it("does not count 々 alone as a kanji", () => {
    expect(check(withData(vocabularyInput, { characters: "々" }))).toThrow(
      new ValidationError("data.characters must hold at least one kanji")
    );
    expect(check(withData(kanaInput, { characters: "どう々" }))).not.toThrow();
  });

  it("refuses a reading that is not kana", () => {
    for (const reading of ["上がる", "agaru"]) {
      const readings = [{ reading, primary: true, accepted_answer: true }];
      expect(check(withData(vocabularyInput, { readings }))).toThrow(
        new ValidationError("data.readings[0].reading must hold only kana")
      );
    }
  });

  describe("the kanji ids of the characters", () => {
    function checkIds(characters: string, ids: number[]) {
      return check(withData(vocabularyInput, { characters, component_subject_ids: ids }));
    }

    it("refuses a wrong, a missing and an extra id, and a wrong order", () => {
      expect(checkIds("上がる", [OTHER_KANJI_ID])).toThrow(
        new ValidationError(
          "data.component_subject_ids must be the ids of 上 in this order, but they are the ids of 下"
        )
      );
      expect(checkIds("上下", [KANJI_ID])).toThrow(
        new ValidationError(
          "data.component_subject_ids must be the ids of 上, 下 in this order, but they are the ids of 上"
        )
      );
      expect(checkIds("上がる", [KANJI_ID, OTHER_KANJI_ID])).toThrow(
        new ValidationError(
          "data.component_subject_ids must be the ids of 上 in this order, but they are the ids of 上, 下"
        )
      );
      expect(checkIds("上下", [OTHER_KANJI_ID, KANJI_ID])).toThrow(
        new ValidationError(
          "data.component_subject_ids must be the ids of 上, 下 in this order, but they are the ids of 下, 上"
        )
      );
    });

    it("counts 々 as a kanji, like WaniKani does", () => {
      expect(checkIds("人々", [PERSON_KANJI_ID])).toThrow(
        new ValidationError(
          "data.component_subject_ids must be the ids of 人, 々 in this order, but they are the ids of 人"
        )
      );
    });

    it("lists a repeated kanji once, at its first place", () => {
      expect(checkIds("日曜日", [SUN_KANJI_ID, WEEKDAY_KANJI_ID])).not.toThrow();
      expect(checkIds("日曜日", [SUN_KANJI_ID, WEEKDAY_KANJI_ID, SUN_KANJI_ID])).toThrow(
        new ValidationError(`data.component_subject_ids[2] ${SUN_KANJI_ID} is listed twice`)
      );
    });

    it("skips the characters rule with no kanji list", () => {
      expect(
        check(withData(vocabularyInput, { component_subject_ids: [999] }), null)
      ).not.toThrow();
    });
  });

  it("refuses a kanji id listed twice and a kanji id that is not an integer", () => {
    expect(
      check(withData(vocabularyInput, { component_subject_ids: [KANJI_ID, KANJI_ID] }))
    ).toThrow(new ValidationError(`data.component_subject_ids[1] ${KANJI_ID} is listed twice`));
    expect(check(withData(vocabularyInput, { component_subject_ids: [1.5] }))).toThrow(
      new ValidationError("data.component_subject_ids[0] must be an integer")
    );
  });

  it("refuses a string of only spaces", () => {
    expect(check(withData(kanaInput, { meaning_mnemonic: "   " }))).toThrow(
      new ValidationError("data.meaning_mnemonic must be a non-empty string")
    );
  });

  it("refuses an auxiliary meaning with an unknown type", () => {
    const auxiliaryMeanings = [{ meaning: "Go Ahead", type: "graylist" }];
    expect(check(withData(kanaInput, { auxiliary_meanings: auxiliaryMeanings }))).toThrow(
      new ValidationError("data.auxiliary_meanings[0].type must be whitelist or blacklist")
    );
  });

  it("refuses conjugations with a missing or an unknown key", () => {
    const { dictionary, masu, te } = kanaVerbInput.data.conjugations;
    const withoutNai = { dictionary, masu, te };
    expect(check(withData(kanaVerbInput, { conjugations: withoutNai }))).toThrow(
      new ValidationError("data.conjugations.nai must be a non-empty string")
    );
    const withPast = { ...kanaVerbInput.data.conjugations, past: "くれた" };
    expect(check(withData(kanaVerbInput, { conjugations: withPast }))).toThrow(
      new ValidationError("data.conjugations.past is not a known field")
    );
  });

  it("throws the ValidationError class", () => {
    expect(thrownBy(check({ ...kanaInput, object: "kanji" }))).toBeInstanceOf(ValidationError);
  });

  it("names the path of a bad nested value", () => {
    const meanings = [
      { meaning: "Please", primary: true, accepted_answer: true },
      { meaning: "Go Ahead", primary: "no", accepted_answer: true },
    ];
    expect(check(withData(kanaInput, { meanings }))).toThrow(
      new ValidationError("data.meanings[1].primary must be a boolean")
    );
  });
});

describe("validateCustomSubjectRecord", () => {
  const record = buildCustomRecord({ id: CUSTOM_SUBJECT_ID_FLOOR, input: kanaInput, now: NOW });

  function withRecordData(data: Record<string, unknown>) {
    return { ...record, data: { ...record.data, ...data } };
  }

  it("accepts a good record", () => {
    expect(() => validateCustomSubjectRecord(record)).not.toThrow();
  });

  it("refuses an id below the floor and a non-integer id", () => {
    const message = `id must be an integer at or above ${CUSTOM_SUBJECT_ID_FLOOR}`;
    expect(() => validateCustomSubjectRecord({ ...record, id: 9000 })).toThrow(
      new ValidationError(message)
    );
    expect(() =>
      validateCustomSubjectRecord({ ...record, id: CUSTOM_SUBJECT_ID_FLOOR + 0.5 })
    ).toThrow(new ValidationError(message));
  });

  it("refuses a level that is not 0", () => {
    expect(() => validateCustomSubjectRecord(withRecordData({ level: 3 }))).toThrow(
      new ValidationError("data.level must be 0")
    );
  });

  it("accepts a hidden record", () => {
    expect(() => validateCustomSubjectRecord(withRecordData({ hidden_at: NOW }))).not.toThrow();
  });

  it("refuses a wrong fixed field", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ slug: "どうも" }, "data.slug must equal data.characters"],
      [{ document_url: "https://www.wanikani.com" }, "data.document_url must be null"],
      [{ pronunciation_audios: [{}] }, "data.pronunciation_audios must be []"],
      [{ pronunciation_audios: null }, "data.pronunciation_audios must be []"],
      [{ lesson_position: 1 }, "data.lesson_position must be 0"],
      [{ spaced_repetition_system_id: 1 }, "data.spaced_repetition_system_id must be 0"],
      [{ created_at: "" }, "data.created_at must be a non-empty string"],
      [{ hidden_at: 5 }, "data.hidden_at must be null or a string"],
    ];
    for (const [data, message] of cases) {
      expect(() => validateCustomSubjectRecord(withRecordData(data))).toThrow(
        new ValidationError(message)
      );
    }
    expect(() => validateCustomSubjectRecord({ ...record, data_updated_at: null })).toThrow(
      new ValidationError("data_updated_at must be a non-empty string")
    );
  });

  it("throws the ValidationError class", () => {
    expect(
      thrownBy(() => validateCustomSubjectRecord(withRecordData({ level: 3 })))
    ).toBeInstanceOf(ValidationError);
  });

  it("runs the input check on the rest of the data", () => {
    expect(() => validateCustomSubjectRecord(withRecordData({ extra: 1 }))).toThrow(
      new ValidationError("data.extra is not a known field")
    );
  });
});

describe("validateCustomSubjects", () => {
  const first = buildCustomRecord({ id: CUSTOM_SUBJECT_ID_FLOOR, input: kanaInput, now: NOW });
  const second = buildCustomRecord({
    id: CUSTOM_SUBJECT_ID_FLOOR + 1,
    input: kanaVerbInput,
    now: NOW,
  });

  it("accepts a good list and an empty one", () => {
    expect(() => validateCustomSubjects([first, second])).not.toThrow();
    expect(() => validateCustomSubjects([])).not.toThrow();
  });

  it("refuses a root that is not an array", () => {
    expect(() => validateCustomSubjects({})).toThrow(
      new ValidationError("the root must be an array")
    );
  });

  it("puts the record id in front of a record problem", () => {
    expect(() => validateCustomSubjects([first, { ...second, url: "x" }])).toThrow(
      new ValidationError(`record ${CUSTOM_SUBJECT_ID_FLOOR + 1}: url must be null`)
    );
  });

  it("refuses a record that is not an object, named by its index", () => {
    expect(() => validateCustomSubjects([first, "どうぞ"])).toThrow(
      new ValidationError("record [1]: the record must be an object")
    );
    expect(thrownBy(() => validateCustomSubjects([first, "どうぞ"]))).toBeInstanceOf(
      ValidationError
    );
  });

  it("refuses two records with one id", () => {
    expect(() => validateCustomSubjects([first, { ...second, id: first.id }])).toThrow(
      new ValidationError(`record ${first.id}: the id is used twice`)
    );
  });

  it("refuses two visible records with the same characters", () => {
    const copy = { ...first, id: CUSTOM_SUBJECT_ID_FLOOR + 2 };
    expect(() => validateCustomSubjects([first, copy])).toThrow(
      new ValidationError(
        `record ${CUSTOM_SUBJECT_ID_FLOOR + 2}: characters どうぞ are used by record ${first.id} too`
      )
    );
  });

  it("accepts the same characters when one record is hidden", () => {
    const hidden = hide(first);
    const copy = { ...first, id: CUSTOM_SUBJECT_ID_FLOOR + 2 };
    expect(() => validateCustomSubjects([hidden, copy])).not.toThrow();
  });
});

describe("findWaniKaniClash", () => {
  const custom = buildCustomRecord({ id: CUSTOM_SUBJECT_ID_FLOOR, input: kanaInput, now: NOW });
  const wanikaniWord = { id: 9001, data: { characters: "どうぞ", hidden_at: null } };

  it("finds a WaniKani word with the same characters", () => {
    expect(findWaniKaniClash({ customSubjects: [custom], wanikaniWords: [wanikaniWord] })).toEqual([
      { customId: CUSTOM_SUBJECT_ID_FLOOR, wanikaniId: 9001, characters: "どうぞ" },
    ]);
  });

  it("skips a hidden WaniKani word and a hidden custom record", () => {
    const hiddenWord = { ...wanikaniWord, data: { ...wanikaniWord.data, hidden_at: NOW } };
    const hiddenCustom = hide(custom);

    expect(findWaniKaniClash({ customSubjects: [custom], wanikaniWords: [hiddenWord] })).toEqual(
      []
    );
    expect(
      findWaniKaniClash({ customSubjects: [hiddenCustom], wanikaniWords: [wanikaniWord] })
    ).toEqual([]);
  });

  it("answers an empty list when no characters match", () => {
    const other = { id: 9002, data: { characters: "ここ", hidden_at: null } };
    expect(findWaniKaniClash({ customSubjects: [custom], wanikaniWords: [other] })).toEqual([]);
  });
});

describe("findCustomSubject", () => {
  it("finds a record by id, hidden ones included", () => {
    const hidden = buildCustomRecord({ id: CUSTOM_SUBJECT_ID_FLOOR, input: kanaInput, now: NOW });
    hidden.data.hidden_at = NOW;

    expect(findCustomSubject([hidden], CUSTOM_SUBJECT_ID_FLOOR)).toBe(hidden);
    expect(findCustomSubject([hidden], CUSTOM_SUBJECT_ID_FLOOR + 1)).toBeNull();
  });
});

describe("nextCustomSubjectId", () => {
  function recordWithId(id: number, hiddenAt: string | null = null): CustomSubject {
    const record = buildCustomRecord({ id, input: kanaInput, now: NOW });
    record.data.hidden_at = hiddenAt;
    return record;
  }

  it("starts at the floor", () => {
    expect(nextCustomSubjectId([])).toBe(CUSTOM_SUBJECT_ID_FLOOR);
  });

  it("answers the largest id plus one, and never fills a gap", () => {
    const records = [
      recordWithId(CUSTOM_SUBJECT_ID_FLOOR + 5),
      recordWithId(CUSTOM_SUBJECT_ID_FLOOR),
    ];
    expect(nextCustomSubjectId(records)).toBe(CUSTOM_SUBJECT_ID_FLOOR + 6);
  });

  it("counts a hidden record", () => {
    const records = [
      recordWithId(CUSTOM_SUBJECT_ID_FLOOR),
      recordWithId(CUSTOM_SUBJECT_ID_FLOOR + 1, NOW),
    ];
    expect(nextCustomSubjectId(records)).toBe(CUSTOM_SUBJECT_ID_FLOOR + 2);
  });
});

describe("buildCustomRecord", () => {
  it("fills the fixed fields and uses the characters as the slug", () => {
    expect(buildCustomRecord({ id: CUSTOM_SUBJECT_ID_FLOOR, input: kanaInput, now: NOW })).toEqual({
      id: CUSTOM_SUBJECT_ID_FLOOR,
      object: "kana_vocabulary",
      url: null,
      data_updated_at: NOW,
      data: {
        ...kanaInput.data,
        created_at: NOW,
        level: 0,
        slug: "どうぞ",
        hidden_at: null,
        document_url: null,
        pronunciation_audios: [],
        lesson_position: 0,
        spaced_repetition_system_id: 0,
      },
    });
  });

  it("keeps the given created_at", () => {
    const createdAt = "2026-11-01T08:00:00.000Z";
    const record = buildCustomRecord({
      id: CUSTOM_SUBJECT_ID_FLOOR,
      input: vocabularyInput,
      now: NOW,
      createdAt,
    });

    expect(record.data.created_at).toBe(createdAt);
    expect(record.data_updated_at).toBe(NOW);
    expect(() => validateCustomSubjectRecord(record)).not.toThrow();
  });
});

describe("buildCustomWordsByKanji", () => {
  it("lists the visible vocabulary words by kanji in file order", () => {
    const word = (id: number, ids: number[], hiddenAt: string | null = null): CustomSubject => {
      const input = {
        ...vocabularyInput,
        data: { ...vocabularyInput.data, component_subject_ids: ids },
      };
      const record = buildCustomRecord({ id, input, now: NOW });
      record.data.hidden_at = hiddenAt;
      return record;
    };
    const records = [
      word(CUSTOM_SUBJECT_ID_FLOOR + 2, [KANJI_ID, OTHER_KANJI_ID]),
      buildCustomRecord({ id: CUSTOM_SUBJECT_ID_FLOOR + 3, input: kanaInput, now: NOW }),
      word(CUSTOM_SUBJECT_ID_FLOOR, [KANJI_ID]),
      word(CUSTOM_SUBJECT_ID_FLOOR + 1, [KANJI_ID], NOW),
    ];

    expect(buildCustomWordsByKanji(records)).toEqual(
      new Map([
        [KANJI_ID, [CUSTOM_SUBJECT_ID_FLOOR + 2, CUSTOM_SUBJECT_ID_FLOOR]],
        [OTHER_KANJI_ID, [CUSTOM_SUBJECT_ID_FLOOR + 2]],
      ])
    );
  });
});
