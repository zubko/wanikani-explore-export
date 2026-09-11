import { describe, expect, it } from "bun:test";
import { join } from "path";
import {
  checkPatch,
  formatStatusLine,
  parsePatches,
  patchSubjects,
  SUBJECT_FILE_NAMES,
  type SubjectPatch,
  type SubjectFile,
  type SubjectRecord,
} from "../subject-patches.ts";

const SEEN = "2026-08-27T17:34:38.403049Z";

const PATCH: SubjectPatch = {
  subject: 785,
  seen: SEEN,
  field: "component_subject_ids",
  expect: [16, 24, 128],
  set: [16, 14, 128],
};

const VALID = `
patches:
  - subject: 785
    seen: "2026-08-27T17:34:38.403049Z"
    field: component_subject_ids
    expect: [16, 24, 128]
    set: [16, 14, 128]

  - subject: 24
    seen: "2026-08-27T17:38:34.259467Z"
    field: amalgamation_subject_ids
    expect: [458, 780, 784]
    set: [458, 784]
`;

const record = (data: Record<string, unknown>, updatedAt = SEEN): SubjectRecord => ({
  id: 785,
  data_updated_at: updatedAt,
  data: { characters: "別", slug: "別", ...data },
});

const onePatch = (body: string) => `patches:\n  - ${body.trim().replace(/\n/g, "\n    ")}\n`;

describe("parsePatches", () => {
  it("returns the patches in file order", () => {
    const patches = parsePatches(VALID);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({
      subject: 785,
      seen: "2026-08-27T17:34:38.403049Z",
      field: "component_subject_ids",
      expect: [16, 24, 128],
      set: [16, 14, 128],
    });
    expect(patches[1]?.subject).toBe(24);
  });

  it("accepts an empty list, the end state once WaniKani fixes everything", () => {
    expect(parsePatches("patches: []")).toEqual([]);
  });

  it("rejects a document that is not a mapping", () => {
    expect(() => parsePatches("just a string")).toThrow(/must be a mapping/);
  });

  it("rejects a missing patches key", () => {
    expect(() => parsePatches("other: 1")).toThrow(/no `patches` key/);
  });

  it("rejects patches that is not a list", () => {
    expect(() => parsePatches("patches: nope")).toThrow(/must be a list/);
  });

  it("rejects a patch that is not a mapping", () => {
    expect(() => parsePatches("patches:\n  - 7\n")).toThrow(/must be a mapping/);
  });

  it("rejects a missing or non-integer subject", () => {
    expect(() => parsePatches(onePatch(`seen: "x"\nfield: f\nexpect: [1]\nset: [2]`))).toThrow(
      /whole number `subject`/
    );
    expect(() =>
      parsePatches(onePatch(`subject: 1.5\nseen: "x"\nfield: f\nexpect: [1]\nset: [2]`))
    ).toThrow(/whole number `subject`/);
  });

  it("rejects an empty seen", () => {
    expect(() =>
      parsePatches(onePatch(`subject: 1\nseen: ""\nfield: f\nexpect: [1]\nset: [2]`))
    ).toThrow(/non-empty `seen`/);
  });

  it("rejects an empty field", () => {
    expect(() =>
      parsePatches(onePatch(`subject: 1\nseen: "x"\nfield: ""\nexpect: [1]\nset: [2]`))
    ).toThrow(/non-empty `field`/);
  });

  it("rejects a missing expect or set", () => {
    expect(() => parsePatches(onePatch(`subject: 1\nseen: "x"\nfield: f\nset: [2]`))).toThrow(
      /`expect` must be a non-empty list/
    );
    expect(() => parsePatches(onePatch(`subject: 1\nseen: "x"\nfield: f\nexpect: [1]`))).toThrow(
      /`set` must be a non-empty list/
    );
  });

  it("rejects an empty id list", () => {
    expect(() =>
      parsePatches(onePatch(`subject: 1\nseen: "x"\nfield: f\nexpect: []\nset: [2]`))
    ).toThrow(/`expect` must be a non-empty list/);
  });

  it("rejects a non-number id", () => {
    expect(() =>
      parsePatches(onePatch(`subject: 1\nseen: "x"\nfield: f\nexpect: [1, "2"]\nset: [2]`))
    ).toThrow(/must hold whole numbers only/);
  });

  it("rejects expect equal to set, which would never settle", () => {
    expect(() =>
      parsePatches(onePatch(`subject: 1\nseen: "x"\nfield: f\nexpect: [1, 2]\nset: [1, 2]`))
    ).toThrow(/equal to `set`/);
  });

  it("rejects two patches targeting the same subject and field", () => {
    const text = `
patches:
  - subject: 1
    seen: "x"
    field: f
    expect: [1]
    set: [2]
  - subject: 1
    seen: "x"
    field: f
    expect: [3]
    set: [4]
`;
    expect(() => parsePatches(text)).toThrow(/both target 1:f/);
  });
});

describe("checkPatch", () => {
  it("applies when the value still holds the broken ids", () => {
    const status = checkPatch(PATCH, record({ component_subject_ids: [16, 24, 128] }));
    expect(status.kind).toBe("apply");
    expect(status.characters).toBe("別");
  });

  it("reports already when the value is the fixed one", () => {
    expect(checkPatch(PATCH, record({ component_subject_ids: [16, 14, 128] })).kind).toBe(
      "already"
    );
  });

  it("fails on a third value and names both lists", () => {
    const status = checkPatch(PATCH, record({ component_subject_ids: [16, 14, 999] }));
    expect(status).toMatchObject({
      kind: "fail",
      reason: "expected [16,24,128], found [16,14,999]",
    });
  });

  it("fails when the subject is not in the download", () => {
    const status = checkPatch(PATCH, undefined);
    expect(status).toMatchObject({ kind: "fail", reason: "subject not found" });
    expect(status.characters).toBeNull();
  });

  it("fails on a changed record even when the value still matches expect", () => {
    const status = checkPatch(
      PATCH,
      record({ component_subject_ids: [16, 24, 128] }, "2026-10-02T09:11:24.000000Z")
    );
    expect(status).toMatchObject({
      kind: "fail",
      reason: `record changed: seen ${SEEN}, now 2026-10-02T09:11:24.000000Z`,
    });
  });

  it("fails when the field is missing", () => {
    expect(checkPatch(PATCH, record({}))).toMatchObject({ kind: "fail", reason: "field missing" });
  });

  it("fails when the field is not a list of ids", () => {
    expect(checkPatch(PATCH, record({ component_subject_ids: 7 }))).toMatchObject({
      kind: "fail",
      reason: "field is not a list of ids",
    });
    expect(checkPatch(PATCH, record({ component_subject_ids: [16, "24"] }))).toMatchObject({
      kind: "fail",
      reason: "field is not a list of ids",
    });
  });

  it("never mutates the record it is given", () => {
    const subject = record({ component_subject_ids: [16, 24, 128] });
    checkPatch(PATCH, subject);
    expect(subject.data.component_subject_ids).toEqual([16, 24, 128]);
    expect(subject.data_updated_at).toBe(SEEN);
  });

  it("falls back to the slug when an image-only radical has no character", () => {
    const subject = record({ characters: null, slug: "gun", component_subject_ids: [16, 24, 128] });
    expect(checkPatch(PATCH, subject).characters).toBe("gun");
  });
});

describe("formatStatusLine", () => {
  const subject = record({ component_subject_ids: [16, 24, 128] });

  it("shows id, character, field and status", () => {
    const line = formatStatusLine(checkPatch(PATCH, subject));
    expect(line).toContain("785");
    expect(line).toContain("別");
    expect(line).toContain("component_subject_ids");
    expect(line).toContain("apply");
  });

  it("shows already", () => {
    const line = formatStatusLine(
      checkPatch(PATCH, record({ component_subject_ids: [16, 14, 128] }))
    );
    expect(line).toContain("already");
  });

  it("shows FAIL with the reason", () => {
    const line = formatStatusLine(checkPatch(PATCH, record({})));
    expect(line).toContain("FAIL");
    expect(line).toContain("field missing");
  });

  it("shows a question mark when there is no character", () => {
    expect(formatStatusLine(checkPatch(PATCH, undefined))).toContain("?");
  });
});

describe("patchSubjects", () => {
  const KANJI: SubjectPatch = PATCH;
  const RADICAL: SubjectPatch = {
    subject: 24,
    seen: "2026-08-27T17:38:34.259467Z",
    field: "amalgamation_subject_ids",
    expect: [458, 780, 784],
    set: [458, 784],
  };

  const buildFiles = (): SubjectFile[] => [
    {
      path: "kanji.json",
      subjects: [
        {
          id: 785,
          data_updated_at: SEEN,
          data: { characters: "別", component_subject_ids: [16, 24, 128] },
        },
        {
          id: 999,
          data_updated_at: SEEN,
          data: { characters: "校", component_subject_ids: [23, 8] },
        },
      ],
    },
    {
      path: "radicals.json",
      subjects: [
        {
          id: 24,
          data_updated_at: "2026-08-27T17:38:34.259467Z",
          data: { characters: "刀", amalgamation_subject_ids: [458, 780, 784] },
        },
      ],
    },
  ];

  it("applies across two files and names both in writes", () => {
    const files = buildFiles();
    const result = patchSubjects({ files, patches: [KANJI, RADICAL] });
    expect(result.ok).toBe(true);
    expect(result.statuses.map((s) => s.kind)).toEqual(["apply", "apply"]);
    expect(result.writes.map((f) => f.path)).toEqual(["kanji.json", "radicals.json"]);
    expect(files[0]?.subjects[0]?.data.component_subject_ids).toEqual([16, 14, 128]);
    expect(files[1]?.subjects[0]?.data.amalgamation_subject_ids).toEqual([458, 784]);
  });

  it("names a file once when two patches land in it", () => {
    const files = buildFiles();
    const second: SubjectPatch = {
      subject: 999,
      seen: SEEN,
      field: "component_subject_ids",
      expect: [23, 8],
      set: [8, 23],
    };
    const result = patchSubjects({ files, patches: [KANJI, second] });
    expect(result.writes.map((f) => f.path)).toEqual(["kanji.json"]);
  });

  it("leaves a file out of writes when nothing in it was applied", () => {
    const files = buildFiles();
    const result = patchSubjects({ files, patches: [KANJI] });
    expect(result.writes.map((f) => f.path)).toEqual(["kanji.json"]);
  });

  it("writes nothing and touches nothing when one patch fails", () => {
    const files = buildFiles();
    const broken: SubjectPatch = { ...RADICAL, seen: "2026-10-02T00:00:00.000000Z" };
    const result = patchSubjects({ files, patches: [KANJI, broken] });
    expect(result.ok).toBe(false);
    expect(result.writes).toEqual([]);
    expect(files[0]?.subjects[0]?.data.component_subject_ids).toEqual([16, 24, 128]);
    expect(files[1]?.subjects[0]?.data.amalgamation_subject_ids).toEqual([458, 780, 784]);
  });

  it("is idempotent: a second run is all already and writes nothing", () => {
    const files = buildFiles();
    patchSubjects({ files, patches: [KANJI, RADICAL] });
    const again = patchSubjects({ files, patches: [KANJI, RADICAL] });
    expect(again.ok).toBe(true);
    expect(again.statuses.map((s) => s.kind)).toEqual(["already", "already"]);
    expect(again.writes).toEqual([]);
  });

  it("dryRun reports the statuses but never mutates or writes", () => {
    const files = buildFiles();
    const result = patchSubjects({ files, patches: [KANJI, RADICAL], dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.statuses.map((s) => s.kind)).toEqual(["apply", "apply"]);
    expect(result.writes).toEqual([]);
    expect(files[0]?.subjects[0]?.data.component_subject_ids).toEqual([16, 24, 128]);
  });

  it("accepts an empty patch list", () => {
    const result = patchSubjects({ files: buildFiles(), patches: [] });
    expect(result).toEqual({ ok: true, statuses: [], writes: [] });
  });

  it("leaves the wrapper fields alone", () => {
    const files = buildFiles();
    patchSubjects({ files, patches: [KANJI] });
    expect(files[0]?.subjects[0]?.id).toBe(785);
    expect(files[0]?.subjects[0]?.data_updated_at).toBe(SEEN);
    expect(files[0]?.subjects[0]?.data.characters).toBe("別");
  });

  it("fails when the patched id is in no file", () => {
    const orphan: SubjectPatch = { ...KANJI, subject: 12345 };
    const result = patchSubjects({ files: buildFiles(), patches: [orphan] });
    expect(result.ok).toBe(false);
    expect(result.statuses[0]).toMatchObject({ kind: "fail", reason: "subject not found" });
  });
});

describe("data/wanikani-fixes.yaml", () => {
  const FIXES = join(import.meta.dir, "../../../data/wanikani-fixes.yaml");
  const USERDATA = join(import.meta.dir, "../../../data/userdata");

  // The few ids each patch adds and removes, written by hand. The long `set` lists are pasted
  // from generated output, where a duplicated or mistyped id keeps the length; this table is
  // short enough to check by eye and pins down what each patch really does.
  const INTENDED: Record<string, { added: number[]; removed: number[] }> = {
    "785:component_subject_ids": { added: [14], removed: [24] },
    "495:component_subject_ids": { added: [1, 14], removed: [8763, 24] },
    "780:component_subject_ids": { added: [14], removed: [24] },
    "14:amalgamation_subject_ids": { added: [495, 780, 785], removed: [] },
    "24:amalgamation_subject_ids": { added: [], removed: [780] },
    "8763:amalgamation_subject_ids": { added: [], removed: [495] },
    "1:amalgamation_subject_ids": { added: [495], removed: [] },
  };

  const readPatches = async () => parsePatches(await Bun.file(FIXES).text());
  const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
  const missing = (from: number[], other: number[]) => from.filter((id) => !other.includes(id));

  it("parses", async () => {
    expect((await readPatches()).length).toBeGreaterThan(0);
  });

  it("changes exactly the ids the delta table names", async () => {
    for (const patch of await readPatches()) {
      const intended = INTENDED[`${patch.subject}:${patch.field}`];
      if (!intended) continue;
      expect(sorted(missing(patch.set, patch.expect))).toEqual(sorted(intended.added));
      expect(sorted(missing(patch.expect, patch.set))).toEqual(sorted(intended.removed));
    }
  });

  it("holds no duplicate ids", async () => {
    for (const patch of await readPatches()) {
      expect(new Set(patch.set).size).toBe(patch.set.length);
      expect(new Set(patch.expect).size).toBe(patch.expect.length);
    }
  });

  it("keeps amalgamation lists sorted ascending", async () => {
    // component_subject_ids is display order, so it is excluded on purpose.
    for (const patch of await readPatches()) {
      if (patch.field !== "amalgamation_subject_ids") continue;
      expect(patch.set).toEqual(sorted(patch.set));
    }
  });

  it("names only ids that exist in the downloaded data", async () => {
    const files = await loadUserdata(USERDATA);
    const ids = new Set(files.flatMap((file) => file.subjects.map((s) => s.id)));
    for (const patch of await readPatches()) {
      for (const id of [...patch.expect, ...patch.set]) expect(ids.has(id)).toBe(true);
    }
  });

  it("applies cleanly to the downloaded data", async () => {
    const result = patchSubjects({
      files: await loadUserdata(USERDATA),
      patches: await readPatches(),
      dryRun: true,
    });
    const bad = result.statuses.filter((s) => s.kind === "fail").map(formatStatusLine);
    expect(bad).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

async function loadUserdata(dir: string): Promise<SubjectFile[]> {
  return Promise.all(
    SUBJECT_FILE_NAMES.map(async (name) => ({
      path: join(dir, name),
      subjects: (await Bun.file(join(dir, name)).json()) as SubjectRecord[],
    }))
  );
}
