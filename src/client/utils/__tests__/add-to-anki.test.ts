import { describe, expect, it } from "bun:test";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import { settle } from "@/test/render.tsx";
import {
  SAVE_FAILED_MESSAGE,
  saveLocalStudyMaterial,
} from "@client/hooks/useLocalStudyMaterial.ts";
import { addToAnkiAfterSaves } from "@client/utils/add-to-anki.ts";

const apiMock: ApiMock = installApiMock();

describe("addToAnkiAfterSaves", () => {
  // adding a kanji writes the notes of its radicals too, so a save of another subject counts
  it("waits for a pending save of another subject", async () => {
    const held = apiMock.answerLater(1, { meaning_note: "Flat ground" });
    const save = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Flat ground" },
    });

    const add = addToAnkiAfterSaves(456, "kanji");
    await settle();

    expect(apiMock.requests).toEqual([{ id: 1, meaning_note: "Flat ground" }]);

    held.resolve();
    await save.done;
    await add;

    expect(apiMock.requests).toEqual([
      { id: 1, meaning_note: "Flat ground" },
      { id: 456, type: "kanji" },
    ]);
  });

  it("adds nothing when a pending save failed", async () => {
    const failing = apiMock.failLater(1, "Server error (500)");
    const save = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Never saved" },
    });

    const add = addToAnkiAfterSaves(456, "kanji").then(
      () => "added",
      (error: unknown) => String(error)
    );
    failing.resolve();
    await expect(save.done).rejects.toThrow("Server error (500)");

    expect(await add).toContain(SAVE_FAILED_MESSAGE);
    expect(apiMock.requests).toEqual([{ id: 1, meaning_note: "Never saved" }]);
  });

  // a save that starts after the wait began leaves `running` the moment it fails, so the wait
  // has to remember the failure instead of only looking at the set
  it("adds nothing when a save that started after the wait failed", async () => {
    const slow = apiMock.answerLater(1, { meaning_note: "Flat ground" });
    const slowSave = saveLocalStudyMaterial({
      subjectId: 1,
      fromServer: null,
      patch: { meaning_note: "Flat ground" },
    });

    const add = addToAnkiAfterSaves(456, "kanji").then(
      () => "added",
      (error: unknown) => String(error)
    );
    await settle();

    const failing = apiMock.failLater(2, "Server error (500)");
    const failedSave = saveLocalStudyMaterial({
      subjectId: 2,
      fromServer: null,
      patch: { meaning_note: "Never saved" },
    });
    failing.resolve();
    await expect(failedSave.done).rejects.toThrow("Server error (500)");

    slow.resolve();
    await slowSave.done;

    expect(await add).toContain(SAVE_FAILED_MESSAGE);
    expect(apiMock.requests).toEqual([
      { id: 1, meaning_note: "Flat ground" },
      { id: 2, meaning_note: "Never saved" },
    ]);
  });
});
