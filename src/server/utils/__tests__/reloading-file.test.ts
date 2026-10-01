import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { resetFsMock, setFileContent, setFsError } from "@/test/preload.ts";
import { createReloadingFile } from "../reloading-file.ts";

const PATH = "./data/userdata/reloading-file-test.txt";

beforeEach(resetFsMock);
afterEach(resetFsMock);

function createTestFile() {
  const parsed: (string | null)[] = [];
  const file = createReloadingFile({
    path: PATH,
    parse: (content) => {
      parsed.push(content);
      if (content === "broken") throw new Error("broken file");
      return content === null ? "no file" : content.toUpperCase();
    },
  });
  return { file, parsed };
}

describe("createReloadingFile", () => {
  test("the first get reads and parses the file", async () => {
    setFileContent(PATH, "one");
    const { file, parsed } = createTestFile();

    expect(await file.get()).toBe("ONE");
    expect(parsed).toEqual(["one"]);
  });

  test("a get with an unchanged file does not read it again", async () => {
    setFileContent(PATH, "one");
    const { file, parsed } = createTestFile();
    await file.get();
    setFsError("readFile", new Error("read again"));

    expect(await file.get()).toBe("ONE");
    expect(parsed).toEqual(["one"]);
  });

  test("a change from outside is read on the next get", async () => {
    setFileContent(PATH, "one");
    const { file } = createTestFile();
    await file.get();

    // the same size, so only the mtime tells the change
    setFileContent(PATH, "two");

    expect(await file.get()).toBe("TWO");
  });

  test("a missing file is parsed as null and read once it exists", async () => {
    const { file, parsed } = createTestFile();

    expect(await file.get()).toBe("no file");
    expect(await file.get()).toBe("no file");
    expect(parsed).toEqual([null]);

    setFileContent(PATH, "one");

    expect(await file.get()).toBe("ONE");
  });

  test("a stat error other than a missing file is thrown", async () => {
    setFileContent(PATH, "one");
    setFsError("stat", Object.assign(new Error("permission denied"), { code: "EACCES" }));
    const { file, parsed } = createTestFile();

    await expect(file.get()).rejects.toThrow("permission denied");
    expect(parsed).toEqual([]);
  });

  test("a parse error is thrown on every get until the file is fixed", async () => {
    setFileContent(PATH, "broken");
    const { file, parsed } = createTestFile();

    await expect(file.get()).rejects.toThrow("broken file");
    await expect(file.get()).rejects.toThrow("broken file");
    expect(parsed).toEqual(["broken", "broken"]);

    setFileContent(PATH, "fixed");

    expect(await file.get()).toBe("FIXED");
  });
});
