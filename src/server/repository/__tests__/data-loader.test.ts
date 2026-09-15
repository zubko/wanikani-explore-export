import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetFsMock, setFileContent, setFsError } from "@/test/preload.ts";
import { LOCAL_STUDY_MATERIALS_PATH, readLocalStudyMaterials } from "../data-loader.ts";

function setFile(content: unknown): void {
  setFileContent(
    LOCAL_STUDY_MATERIALS_PATH,
    typeof content === "string" ? content : JSON.stringify(content)
  );
}

async function readError(): Promise<string> {
  return await readLocalStudyMaterials().then(
    () => "no error",
    (error: unknown) => String(error)
  );
}

beforeEach(resetFsMock);
afterEach(resetFsMock);

describe("readLocalStudyMaterials", () => {
  test("reads a file the user typed by hand", async () => {
    const file = {
      "1": { meaning_note: "Flat ground", meaning_synonyms: ["ground"] },
      "456": { reading_note: "Kawa like a river bank" },
      "958": {},
    };
    setFile(file);

    expect(await readLocalStudyMaterials()).toEqual(file);
  });

  test("a string where the synonym list belongs names the subject and the field", async () => {
    setFile({ "1": { meaning_synonyms: "ground" } });

    expect(await readError()).toContain("subject 1 field meaning_synonyms must be an array");
  });

  test("a synonym that is not a string is refused", async () => {
    setFile({ "1": { meaning_synonyms: ["ground", 7] } });

    expect(await readError()).toContain("subject 1 field meaning_synonyms must be an array");
  });

  test("a note that is not a string names the subject and the field", async () => {
    setFile({ "456": { meaning_note: ["Two lines"] } });

    expect(await readError()).toContain("subject 456 field meaning_note must be a string");
  });

  test("an unknown field is refused", async () => {
    setFile({ "456": { reading_hint: "Kawa" } });

    expect(await readError()).toContain("subject 456 field reading_hint is not a known field");
  });

  test("an array root is refused", async () => {
    setFile([]);

    expect(await readError()).toContain("the root must be a JSON object");
  });

  test("an entry that is not an object is refused", async () => {
    setFile({ "1": "Flat ground" });

    expect(await readError()).toContain("subject 1 must be a JSON object");
  });

  test("a missing file tells the user to create it", async () => {
    setFsError("readFile", Object.assign(new Error("no such file"), { code: "ENOENT" }));

    expect(await readError()).toContain("Create it with {} inside");
  });

  test("broken JSON reports the parse error and not the create hint", async () => {
    setFile("{ broken");

    const error = await readError();
    expect(error).toContain(`Cannot read ${LOCAL_STUDY_MATERIALS_PATH}`);
    expect(error).toContain("JSON");
    expect(error).not.toContain("Create it with");
  });
});
