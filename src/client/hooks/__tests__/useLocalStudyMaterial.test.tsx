import { describe, expect, it, beforeEach, afterEach, afterAll } from "bun:test";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import { mount, settle, type Mounted } from "@/test/render.ts";
import {
  resetLocalStudyMaterials,
  saveLocalStudyMaterial,
  useLocalStudyMaterial,
} from "@client/hooks/useLocalStudyMaterial.ts";

const apiMock: ApiMock = installApiMock();

type ProbeProps = { subjectId: number; fromServer?: LocalStudyMaterial | null };

function Probe({ subjectId, fromServer = null }: ProbeProps) {
  const record = useLocalStudyMaterial(subjectId, fromServer);
  return <span>{JSON.stringify(record)}</span>;
}

function shownRecord(view: Mounted): LocalStudyMaterial | null {
  return JSON.parse(view.container.textContent || "null") as LocalStudyMaterial | null;
}

beforeEach(() => {
  apiMock.reset();
  resetLocalStudyMaterials();
});

afterEach(() => {
  resetLocalStudyMaterials();
});

afterAll(() => {
  apiMock.restore();
});

describe("saveLocalStudyMaterial with two subjects at once", () => {
  it("keeps the entry of the subject that answered first", async () => {
    const first = mount(<Probe subjectId={1} />);
    const second = mount(<Probe subjectId={2} />);
    const slow = apiMock.answerLater(1, { meaning_note: "Note of one" });
    const fast = apiMock.answerLater(2, { meaning_note: "Note of two" });

    const saveOne = saveLocalStudyMaterial({
      subjectId: 1,
      current: null,
      patch: { meaning_note: "Note of one" },
    });
    const saveTwo = saveLocalStudyMaterial({
      subjectId: 2,
      current: null,
      patch: { meaning_note: "Note of two" },
    });
    fast.resolve();
    await settle();
    slow.resolve();
    await Promise.all([saveOne, saveTwo]);
    await settle();

    expect(shownRecord(second)).toEqual({ meaning_note: "Note of two" });
    expect(shownRecord(first)).toEqual({ meaning_note: "Note of one" });
    first.unmount();
    second.unmount();
  });

  it("a failed save stays rolled back when the other subject answers later", async () => {
    const first = mount(<Probe subjectId={1} fromServer={{ meaning_note: "From server" }} />);
    const second = mount(<Probe subjectId={2} />);
    const failing = apiMock.failLater(1, "Server error (500)");
    const working = apiMock.answerLater(2, { meaning_note: "Note of two" });

    const saveOne = saveLocalStudyMaterial({
      subjectId: 1,
      current: { meaning_note: "From server" },
      patch: { meaning_note: "Never saved" },
    });
    const saveTwo = saveLocalStudyMaterial({
      subjectId: 2,
      current: null,
      patch: { meaning_note: "Note of two" },
    });
    failing.resolve();
    await expect(saveOne).rejects.toThrow("Server error (500)");
    await settle();
    working.resolve();
    await saveTwo;
    await settle();

    expect(shownRecord(second)).toEqual({ meaning_note: "Note of two" });
    expect(shownRecord(first)).toEqual({ meaning_note: "From server" });
    first.unmount();
    second.unmount();
  });
});

describe("saveLocalStudyMaterial with two saves for one subject", () => {
  it("sends the second save only after the first one answered", async () => {
    const view = mount(<Probe subjectId={1} fromServer={{ meaning_note: "From server" }} />);
    const failingNote = apiMock.failLater(1, "Server error (500)");
    const workingSynonyms = apiMock.answerLater(1, {
      meaning_note: "From server",
      meaning_synonyms: ["beta"],
    });

    const saveNote = saveLocalStudyMaterial({
      subjectId: 1,
      current: { meaning_note: "From server" },
      patch: { meaning_note: "Never saved" },
    });
    const saveSynonyms = saveLocalStudyMaterial({
      subjectId: 1,
      current: { meaning_note: "From server" },
      patch: { meaning_synonyms: ["beta"] },
    });
    workingSynonyms.resolve();
    await settle();

    expect(apiMock.requests).toEqual([{ id: 1, meaning_note: "Never saved" }]);

    failingNote.resolve();
    await expect(saveNote).rejects.toThrow("Server error (500)");
    await saveSynonyms;
    await settle();

    expect(apiMock.requests).toEqual([
      { id: 1, meaning_note: "Never saved" },
      { id: 1, meaning_synonyms: ["beta"] },
    ]);
    expect(shownRecord(view)).toEqual({
      meaning_note: "From server",
      meaning_synonyms: ["beta"],
    });
    view.unmount();
  });

  it("the second save starts from the value the first one stored", async () => {
    const view = mount(<Probe subjectId={1} />);
    const note = apiMock.answerLater(1, { meaning_note: "Saved note" });
    const synonyms = apiMock.answerLater(1, {
      meaning_note: "Saved note",
      meaning_synonyms: ["beta"],
    });

    const saveNote = saveLocalStudyMaterial({
      subjectId: 1,
      current: null,
      patch: { meaning_note: "Saved note" },
    });
    const saveSynonyms = saveLocalStudyMaterial({
      subjectId: 1,
      current: null,
      patch: { meaning_synonyms: ["beta"] },
    });
    note.resolve();
    synonyms.resolve();
    await Promise.all([saveNote, saveSynonyms]);
    await settle();

    expect(shownRecord(view)).toEqual({
      meaning_note: "Saved note",
      meaning_synonyms: ["beta"],
    });
    view.unmount();
  });
});
