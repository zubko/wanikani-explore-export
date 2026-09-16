import { describe, expect, it } from "bun:test";
import type { LocalStudyMaterial } from "@/model/wanikani.ts";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import { mount, settle, type Mounted } from "@/test/render.tsx";
import {
  SAVE_FAILED_MESSAGE,
  saveLocalStudyMaterial,
  useLocalStudyMaterial,
  waitForLocalStudyMaterialSaves,
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
    await Promise.all([saveOne.done, saveTwo.done]);
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
    await expect(saveOne.done).rejects.toThrow("Server error (500)");
    await settle();
    working.resolve();
    await saveTwo.done;
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
      patch: { add_synonym: "alpha" },
    });
    fast.resolve();
    await saveTwo.done;
    slow.resolve();
    await saveOne.done;
    await settle();

    apiMock.answerWith({ meaning_synonyms: ["alpha", "beta"] });
    await saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
      patch: { add_synonym: "beta" },
    }).done;
    await settle();

    expect(apiMock.requests.at(-1)).toEqual({ id: 2, add_synonym: "beta" });
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
      patch: { add_synonym: "alpha" },
    }).done;
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
      patch: { add_synonym: "beta" },
    }).done;
    await settle();

    expect(apiMock.requests.at(-1)).toEqual({ id: 1, add_synonym: "beta" });
    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["alpha", "by hand", "beta"] });
  });

  it("sends an operation and no list when a record lands while the save runs", async () => {
    const view = mount(<Probe subjectId={1} />);
    const held = apiMock.answerLater(1, { meaning_synonyms: ["alpha"] });

    const save = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { add_synonym: "alpha" },
    });

    // a record the tab never saw: a search answer from before the save, or a hand edit
    const outside = { meaning_synonyms: ["by hand"] };
    view.rerender(<Probe subjectId={1} fromServer={outside} />);
    await settle();

    held.resolve();
    await save.done;
    await settle();

    // the page record wins on screen, and the next save still only names its own word
    apiMock.answerWith({ meaning_synonyms: ["by hand", "alpha", "beta"] });
    await saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: outside,
      patch: { add_synonym: "beta" },
    }).done;
    await settle();

    expect(apiMock.requests).toEqual([
      { id: 1, add_synonym: "alpha" },
      { id: 1, add_synonym: "beta" },
    ]);
    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["by hand", "alpha", "beta"] });
  });

  it("follows the outside record when the save that ran meanwhile failed", async () => {
    const view = mount(<Probe subjectId={1} />);
    apiMock.answerWith({ meaning_note: "Saved" });
    await saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Saved" },
    }).done;
    await settle();

    const failing = apiMock.failLater(1, "Server error (500)");
    const save = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Never saved" },
    });

    const outside = { meaning_note: "Typed into the file" };
    view.rerender(<Probe subjectId={1} fromServer={outside} />);
    await settle();

    failing.resolve();
    await expect(save.done).rejects.toThrow("Server error (500)");
    await settle();

    expect(shownRecord(view)).toEqual(outside);
  });

  it("keeps the session record while the server record stays the same", async () => {
    const view = mount(<Probe subjectId={1} />);
    apiMock.answerWith({ meaning_note: "Saved note" });

    await saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Saved note" },
    }).done;
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
    const workingSynonym = apiMock.answerLater(1, {
      meaning_note: "From server",
      meaning_synonyms: ["beta"],
    });

    const saveNote = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_note: "From server" },
      patch: { meaning_note: "Never saved" },
    });
    const saveSynonym = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_note: "From server" },
      patch: { add_synonym: "beta" },
    });
    workingSynonym.resolve();
    await settle();

    expect(apiMock.requests).toEqual([{ id: 1, meaning_note: "Never saved" }]);

    failingNote.resolve();
    await expect(saveNote.done).rejects.toThrow("Server error (500)");
    await saveSynonym.done;
    await settle();

    expect(apiMock.requests).toEqual([
      { id: 1, meaning_note: "Never saved" },
      { id: 1, add_synonym: "beta" },
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
    await Promise.all([saveNote.done, saveReading.done]);
    await settle();

    expect(shownRecord(view)).toEqual({ meaning_note: "First", reading_note: "Second" });
  });

  it("never carries the word of a failed save into the next payload", async () => {
    const view = mount(<Probe subjectId={1} fromServer={{ meaning_synonyms: ["american"] }} />);
    const failingAdd = apiMock.failLater(1, "Server error (500)");

    const saveAdd = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_synonyms: ["american"] },
      patch: { add_synonym: "yank" },
    });
    const saveRemove = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: { meaning_synonyms: ["american"] },
      patch: { remove_synonym: "american" },
    });
    await settle();

    expect(shownRecord(view)).toEqual({ meaning_synonyms: ["yank"] });
    expect(apiMock.requests).toEqual([{ id: 1, add_synonym: "yank" }]);

    apiMock.answerWith(null);
    failingAdd.resolve();
    await expect(saveAdd.done).rejects.toThrow("Server error (500)");
    await saveRemove.done;
    await settle();

    expect(apiMock.requests).toEqual([
      { id: 1, add_synonym: "yank" },
      { id: 1, remove_synonym: "american" },
    ]);
    expect(shownRecord(view)).toBeNull();
  });

  it("the second save starts from the value the first one stored", async () => {
    const view = mount(<Probe subjectId={1} />);
    const note = apiMock.answerLater(1, { meaning_note: "Saved note" });
    const synonym = apiMock.answerLater(1, {
      meaning_note: "Saved note",
      meaning_synonyms: ["beta"],
    });

    const saveNote = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Saved note" },
    });
    const saveSynonym = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { add_synonym: "beta" },
    });
    note.resolve();
    synonym.resolve();
    await Promise.all([saveNote.done, saveSynonym.done]);
    await settle();

    expect(shownRecord(view)).toEqual({
      meaning_note: "Saved note",
      meaning_synonyms: ["beta"],
    });
  });
});

describe("isLatest of a save handle", () => {
  it("is false for a save another card of the same field started later", async () => {
    const failing = apiMock.failLater(1, "Server error (500)");

    const first = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "First" },
    });
    apiMock.answerWith({ meaning_note: "Second" });
    const second = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Second" },
    });

    failing.resolve();
    await expect(first.done).rejects.toThrow("Server error (500)");
    await second.done;

    expect(first.isLatest()).toBe(false);
    expect(second.isLatest()).toBe(true);
  });

  it("stays true when the later save is of another field", async () => {
    const failing = apiMock.failLater(1, "Server error (500)");

    const note = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Note" },
    });
    apiMock.answerWith({ reading_note: "Reading" });
    const reading = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { reading_note: "Reading" },
    });

    failing.resolve();
    await expect(note.done).rejects.toThrow("Server error (500)");
    await reading.done;

    expect(note.isLatest()).toBe(true);
  });

  it("stays true when the later save is of another subject", async () => {
    const failing = apiMock.failLater(1, "Server error (500)");

    const first = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "First" },
    });
    apiMock.answerWith({ meaning_note: "Second" });
    const second = saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
      patch: { meaning_note: "Second" },
    });

    failing.resolve();
    await expect(first.done).rejects.toThrow("Server error (500)");
    await second.done;

    expect(first.isLatest()).toBe(true);
  });
});

describe("waitForLocalStudyMaterialSaves", () => {
  it("waits for the saves of every subject, not only of one", async () => {
    const held = apiMock.answerLater(2, { meaning_note: "Of another subject" });
    const save = saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
      patch: { meaning_note: "Of another subject" },
    });

    let waited = false;
    const wait = waitForLocalStudyMaterialSaves().then(() => {
      waited = true;
    });
    await settle();
    expect(waited).toBe(false);

    held.resolve();
    await save.done;
    await wait;

    expect(waited).toBe(true);
  });

  it("rejects when a save failed", async () => {
    const failing = apiMock.failLater(1, "Server error (500)");
    const save = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Never saved" },
    });

    const wait = waitForLocalStudyMaterialSaves().then(
      () => "no error",
      (error: unknown) => String(error)
    );
    failing.resolve();
    await expect(save.done).rejects.toThrow("Server error (500)");

    expect(await wait).toContain(SAVE_FAILED_MESSAGE);
  });

  it("resolves at once when no save is running", async () => {
    await waitForLocalStudyMaterialSaves();
  });
});
