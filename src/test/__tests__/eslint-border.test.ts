import { describe, expect, it } from "bun:test";
import { ESLint } from "eslint";
import { resolve } from "path";

type Case = { file: string; code: string; rule?: string };

const IMPORTS_RULE = "@typescript-eslint/no-restricted-imports";
const SYNTAX_RULE = "no-restricted-syntax";

const eslint = new ESLint({ cwd: resolve(import.meta.dir, "../../..") });

const MUST_FAIL: Case[] = [
  { file: "scripts/x.ts", code: `import { getWords } from "@server/repository/data-loader.ts";` },
  { file: "scripts/x.ts", code: `import { x } from "../../src/server/x.ts";` },
  { file: "scripts/x.ts", code: `import { x } from "../src/shared/x.ts";` },
  { file: "src/client/x.ts", code: `import { ApiType } from "@server/api.ts";` },
  { file: "src/client/x.ts", code: `import { readJson } from "@shared/files/json-file.ts";` },
  { file: "src/client/x.ts", code: `import { readJson } from "../shared/files/json-file.ts";` },
  { file: "src/client/x.ts", code: `import { x } from "@shared/anki/anki-connect-invoke.ts";` },
  { file: "src/client/x.ts", code: `import { x } from "../../scripts/lib/text-vocab.ts";` },
  { file: "src/client/x.ts", code: `import { x } from "../shared/wanikani/wanikani.ts";` },
  { file: "src/shared/x.ts", code: `import { x } from "@server/api.ts";` },
  { file: "src/shared/x.ts", code: `import { x } from "@/test/preload.ts";` },
  { file: "src/shared/data-paths.ts", code: `import { x } from "./theme.ts";` },
  {
    file: "src/shared/wanikani/x.ts",
    code: `import { readJson } from "@shared/files/json-file.ts";`,
  },
  { file: "src/shared/wanikani/x.ts", code: `import { readJson } from "../files/json-file.ts";` },
  { file: "src/shared/theme.ts", code: `import { x } from "./anki/anki-connect-invoke.ts";` },
  { file: "src/server/x.ts", code: `import { x } from "@client/api.ts";` },
  { file: "src/server/x.ts", code: `import { x } from "../shared/theme.ts";` },
  { file: "src/server/x.ts", code: `import { x } from "@/shared/theme.ts";` },
  { file: "src/client/x.ts", code: `import { x } from "@/shared/theme.ts";` },
  { file: "scripts/x.ts", code: `import { x } from "@/shared/theme.ts";` },
  { file: "src/shared/x.ts", code: `import { x } from "@/shared/theme.ts";` },
  {
    file: "scripts/x.ts",
    code: `await import("@server/repository/data-loader.ts");`,
    rule: SYNTAX_RULE,
  },
  {
    file: "src/client/x.ts",
    code: `await import("@shared/files/json-file.ts");`,
    rule: SYNTAX_RULE,
  },
];

const MUST_PASS: Case[] = [
  { file: "scripts/x.ts", code: `import type { ApiType } from "@server/api.ts";` },
  { file: "src/client/x.ts", code: `import type { ApiType } from "@server/api.ts";` },
  { file: "src/client/x.ts", code: `import { x } from "@shared/wanikani/wanikani.ts";` },
  { file: "src/client/x.ts", code: `import { hc } from "hono/client";` },
  { file: "scripts/x.ts", code: `import { readJson } from "@shared/files/json-file.ts";` },
  { file: "src/server/x.ts", code: `import { x } from "@shared/anki/anki-connect-invoke.ts";` },
  { file: "src/shared/files/__tests__/x.test.ts", code: `import { x } from "@/test/preload.ts";` },
  { file: "src/shared/files/__tests__/x.test.ts", code: `import { x } from "../json-file.ts";` },
  { file: "src/shared/files/json-file.ts", code: `import { x } from "./file-utils.ts";` },
  { file: "src/shared/wanikani/x.ts", code: `import { x } from "./wanikani.ts";` },
  { file: "src/shared/wanikani/x.ts", code: `import { x } from "@shared/theme.ts";` },
  {
    file: "src/server/__tests__/x.test.ts",
    code: `await import("@server/repository/data-loader.ts");`,
  },
  { file: "src/test/x.ts", code: `await import("@server/repository/data-loader.ts");` },
];

describe("ESLint border rule", () => {
  it.each(MUST_FAIL)("refuses $code in $file", async ({ file, code, rule = IMPORTS_RULE }) => {
    expect(await ruleIdsOf({ file, code })).toEqual([rule]);
  });

  it.each(MUST_PASS)("accepts $code in $file", async ({ file, code }) => {
    expect(await ruleIdsOf({ file, code })).toEqual([]);
  });
});

async function ruleIdsOf({ file, code }: Case): Promise<string[]> {
  const results = await eslint.lintText(`${code}\nexport {};\n`, { filePath: file });
  const ruleIds = results
    .flatMap((result) => result.messages)
    .map((message) => message.ruleId ?? "")
    .filter((ruleId) => ruleId === IMPORTS_RULE || ruleId === SYNTAX_RULE);
  return [...new Set(ruleIds)];
}
