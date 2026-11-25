import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

const SERVER = ["@server/**", "**/server/**"];
const CLIENT = ["@client/**", "**/client/**"];
const SCRIPTS = ["**/scripts/**"];
const SERVER_BUT_API = [...SERVER, "!@server/api.ts"];
const SHARED_SPELLING_BAN = {
  group: ["@/shared/**", "**/shared/**"],
  message: "Import shared code as @shared/...",
};
const NODE_ONLY_SHARED_BAN = {
  group: ["@shared/files/**", "**/files/**", "**/anki-connect-invoke*"],
  message:
    "Only the server and the scripts may import the Node file helpers or the AnkiConnect call.",
};
const SHARED_BANS = [
  { group: SERVER, message: "Shared code must not import the server." },
  { group: CLIENT, message: "Shared code must not import the client." },
  { group: SCRIPTS, message: "Shared code must not import the scripts." },
  SHARED_SPELLING_BAN,
];
const SHARED_TEST_SETUP_BAN = {
  group: ["@/test/**", "**/test/**"],
  message: "Shared code must not import the test setup.",
};
const API_TYPE_ONLY = {
  name: "@server/api.ts",
  allowTypeImports: true,
  message: "Import only the ApiType type from the server.",
};
const TEST_FILES = ["src/test/**", "**/__tests__/**"];

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ["node_modules", "dist"],
  },
  {
    files: ["src/**", "scripts/**"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message: "Use a static import, so the border rule can check it.",
        },
      ],
    },
  },
  // A later block replaces the rule options of an earlier block for the same file, so each block lists all of its bans.
  restrictImports({
    files: ["src/shared/**"],
    patterns: [...SHARED_BANS, SHARED_TEST_SETUP_BAN],
  }),
  restrictImports({
    files: ["src/shared/**"],
    ignores: ["src/shared/files/**", "src/shared/anki/anki-connect-invoke.ts", ...TEST_FILES],
    patterns: [...SHARED_BANS, SHARED_TEST_SETUP_BAN, NODE_ONLY_SHARED_BAN],
  }),
  restrictImports({
    files: ["src/shared/**/__tests__/**"],
    patterns: SHARED_BANS,
  }),
  restrictImports({
    files: ["src/shared/data-paths.ts"],
    patterns: [
      {
        group: ["*"],
        message:
          "data-paths.ts must stay free of imports, the test preload loads it before mock.module.",
      },
    ],
  }),
  restrictImports({
    files: ["src/server/**"],
    patterns: [
      { group: CLIENT, message: "The server must not import the client." },
      { group: SCRIPTS, message: "The server must not import the scripts." },
      SHARED_SPELLING_BAN,
    ],
  }),
  restrictImports({
    files: ["src/client/**"],
    paths: [API_TYPE_ONLY],
    patterns: [
      { group: SERVER_BUT_API, message: "The client must not import the server." },
      { group: SCRIPTS, message: "The client must not import the scripts." },
      NODE_ONLY_SHARED_BAN,
      SHARED_SPELLING_BAN,
    ],
  }),
  restrictImports({
    files: ["scripts/**"],
    paths: [API_TYPE_ONLY],
    patterns: [
      {
        group: SERVER_BUT_API,
        message: "Scripts must call the server through the dev server API.",
      },
      { group: CLIENT, message: "Scripts must not import the client." },
      SHARED_SPELLING_BAN,
    ],
  })
);

function restrictImports({ files, ignores = [], paths = [], patterns }) {
  return {
    files,
    ignores,
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { paths, patterns }],
    },
  };
}
