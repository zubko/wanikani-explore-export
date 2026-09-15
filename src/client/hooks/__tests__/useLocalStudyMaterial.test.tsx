import { describe, expect, it } from "bun:test";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import { mount, settle, type Mounted } from "@/test/render.tsx";
import {
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

describe("saveLocalStudyMaterial with two subjects at once", () => {
  it("keeps the entry of the subject that answered first", async () => {
    const first = mount(<Probe subjectId={1} />);
    const second = mount(<Probe subjectId={2} />);
    const slow = apiMock.answerLater(1, { meaning_note: "Note of one" });
    const fast = apiMock.answerLater(2, { meaning_note: "Note of two" });

    const saveOne = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Note of one" },
    });
    const saveTwo = saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
      patch: { meaning_note: "Note of two" },
    });
    fast.resolve();
    await settle();
    slow.resolve();
    await Promise.all([saveOne, saveTwo]);
    await settle();

    expect(shownRecord(second)).toEqual({ meaning_note: "Note of two" });
    expect(shownRecord(first)).toEqual({ meaning_note: "Note of one" });
  });

  it("a failed save stays rolled back when the other subject answers later", async () => {
    const first = mount(<Probe subjectId={1} fromServer={{ meaning_note: "From server" }} />);
    const second = mount(<Probe subjectId={2} />);
    const failing = apiMock.failLater(1, "Server error (500)");
    const working = apiMock.answerLater(2, { meaning_note: "Note of two" });

    const saveOne = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_note: "From server" },
      patch: { meaning_note: "Never saved" },
    });
    const saveTwo = saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
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
  });

  it("keeps the confirmed record of the other subject when the slower save answers", async () => {
    mount(<Probe subjectId={1} />);
    const second = mount(<Probe subjectId={2} />);
    const slow = apiMock.answerLater(1, { meaning_note: "Note of one" });
    const fast = apiMock.answerLater(2, { meaning_synonyms: ["alpha"] });

    const saveOne = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Note of one" },
    });
    const saveTwo = saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
      patch: (current) => ({ meaning_synonyms: [...(current?.meaning_synonyms ?? []), "alpha"] }),
    });
    fast.resolve();
    await saveTwo;
    slow.resolve();
    await saveOne;
    await settle();

    apiMock.answerWith({ meaning_synonyms: ["alpha", "beta"] });
    await saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
      patch: (current) => ({ meaning_synonyms: [...(current?.meaning_synonyms ?? []), "beta"] }),
    });
    await settle();

    expect(apiMock.requests.at(-1)).toEqual({ id: 2, meaning_synonyms: ["alpha", "beta"] });
    expect(shownRecord(second)).toEqual({ meaning_synonyms: ["alpha", "beta"] });
  });
});

describe("saveLocalStudyMaterial with a changed server record", () => {
  it("drops the session record when the page is rendered with a new server record", async () => {
    const view = mount(<Probe subjectId={1} />);
    apiMock.answerWith({ meaning_synonyms: ["alpha"] });

    await saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: (current) => ({ meaning_synonyms: [...(current?.meaning_synonyms ?? []), "alpha"] }),
    });
    await settle();
    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["alpha"] });

    // the file changed outside the tab, so a new search answer carries another record
    const fresh = { meaning_synonyms: ["alpha", "by hand"] };
    view.rerender(<Probe subjectId={1} fromServer={fresh} />);
    await settle();
    expect(shownRecord(view)).toEqual(fresh);

    apiMock.answerWith({ meaning_synonyms: ["alpha", "by hand", "beta"] });
    await saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: fresh,
      patch: (current) => ({ meaning_synonyms: [...(current?.meaning_synonyms ?? []), "beta"] }),
    });
    await settle();

    expect(apiMock.requests.at(-1)).toEqual({
      id: 1,
      meaning_synonyms: ["alpha", "by hand", "beta"],
    });
    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["alpha", "by hand", "beta"] });
  });

  it("keeps the confirmed result when the new server record lands while the save runs", async () => {
    const view = mount(<Probe subjectId={1} />);
    const held = apiMock.answerLater(1, { meaning_synonyms: ["alpha"] });

    const save = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: (current) => ({ meaning_synonyms: [...(current?.meaning_synonyms ?? []), "alpha"] }),
    });

    // a search answer that was already on its way carries the record from before the save
    const older = { meaning_note: "From the search" };
    view.rerender(<Probe subjectId={1} fromServer={older} />);
    await settle();

    held.resolve();
    await save;
    await settle();

    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["alpha"] });

    apiMock.answerWith({ meaning_synonyms: ["alpha", "beta"] });
    await saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: older,
      patch: (current) => ({ meaning_synonyms: [...(current?.meaning_synonyms ?? []), "beta"] }),
    });
    await settle();

    expect(apiMock.requests.at(-1)).toEqual({ id: 1, meaning_synonyms: ["alpha", "beta"] });
    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["alpha", "beta"] });
  });

  it("keeps the session record while the server record stays the same", async () => {
    const view = mount(<Probe subjectId={1} />);
    apiMock.answerWith({ meaning_note: "Saved note" });

    await saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Saved note" },
    });
    await settle();

    view.rerender(<Probe subjectId={1} />);
    await settle();

    expect(shownRecord(view)).toEqual({ meaning_note: "Saved note" });
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
      fromServer: { meaning_note: "From server" },
      patch: { meaning_note: "Never saved" },
    });
    const saveSynonyms = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_note: "From server" },
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
  });

  it("shows the second save at once while the first request is still in flight", async () => {
    const view = mount(<Probe subjectId={1} />);
    const heldNote = apiMock.answerLater(1, { meaning_note: "First" });

    const saveNote = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "First" },
    });
    const saveReading = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { reading_note: "Second" },
    });
    await settle();

    expect(shownRecord(view)).toEqual({ meaning_note: "First", reading_note: "Second" });
    expect(apiMock.requests).toEqual([{ id: 1, meaning_note: "First" }]);

    apiMock.answerWith({ meaning_note: "First", reading_note: "Second" });
    heldNote.resolve();
    await Promise.all([saveNote, saveReading]);
    await settle();

    expect(shownRecord(view)).toEqual({ meaning_note: "First", reading_note: "Second" });
  });

  it("builds a queued payload from the confirmed record, not from the shown one", async () => {
    const view = mount(<Probe subjectId={1} fromServer={{ meaning_synonyms: ["american"] }} />);
    const failingAdd = apiMock.failLater(1, "Server error (500)");

    const saveAdd = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_synonyms: ["american"] },
      patch: (current) => ({ meaning_synonyms: [...(current?.meaning_synonyms ?? []), "yank"] }),
    });
    const saveRemove = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_synonyms: ["american"] },
      patch: (current) => ({
        meaning_synonyms: (current?.meaning_synonyms ?? []).filter((item) => item !== "american"),
      }),
    });
    await settle();

    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["yank"] });
    expect(apiMock.requests).toEqual([{ id: 1, meaning_synonyms: ["american", "yank"] }]);

    apiMock.answerWith(null);
    failingAdd.resolve();
    await expect(saveAdd).rejects.toThrow("Server error (500)");
    await saveRemove;
    await settle();

    expect(apiMock.requests).toEqual([
      { id: 1, meaning_synonyms: ["american", "yank"] },
      { id: 1, meaning_synonyms: [] },
    ]);
    expect(shownRecord(view)).toBeNull();
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
      fromServer: null,
      patch: { meaning_note: "Saved note" },
    });
    const saveSynonyms = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
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
  });
});
