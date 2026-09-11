export type SubjectPatch = {
  subject: number;
  seen: string;
  field: string;
  expect: number[];
  set: number[];
};

export type SubjectRecord = {
  id: number;
  data_updated_at: string;
  data: Record<string, unknown>;
};

export type SubjectFile = {
  path: string;
  subjects: SubjectRecord[];
};

export type PatchStatus = { patch: SubjectPatch; characters: string | null } & (
  | { kind: "apply" }
  | { kind: "already" }
  | { kind: "fail"; reason: string }
);

export type PatchResult = {
  ok: boolean;
  statuses: PatchStatus[];
  writes: SubjectFile[];
};

export const SUBJECT_FILE_NAMES = [
  "radicals.json",
  "kanji.json",
  "vocabulary.json",
  "kana_vocabulary.json",
];

export function parsePatches(text: string): SubjectPatch[] {
  const document = Bun.YAML.parse(text);

  if (!isRecord(document)) {
    throw new Error("wanikani fixes: the file must be a mapping with a `patches` key");
  }
  if (!("patches" in document)) {
    throw new Error("wanikani fixes: no `patches` key");
  }
  const list = document.patches;
  if (!Array.isArray(list)) {
    throw new Error("wanikani fixes: `patches` must be a list");
  }

  const patches = list.map((entry, index) => toPatch(entry, index));
  rejectDuplicates(patches);
  return patches;
}

export function checkPatch(patch: SubjectPatch, subject: SubjectRecord | undefined): PatchStatus {
  const characters = readCharacters(subject);
  const fail = (reason: string): PatchStatus => ({ kind: "fail", patch, characters, reason });

  if (!subject) return fail("subject not found");
  if (subject.data_updated_at !== patch.seen) {
    return fail(`record changed: seen ${patch.seen}, now ${subject.data_updated_at}`);
  }
  if (!(patch.field in subject.data)) return fail("field missing");

  const value = subject.data[patch.field];
  if (!Array.isArray(value) || !value.every((id) => typeof id === "number")) {
    return fail("field is not a list of ids");
  }

  if (sameIds(value, patch.expect)) return { kind: "apply", patch, characters };
  if (sameIds(value, patch.set)) return { kind: "already", patch, characters };
  return fail(`expected [${patch.expect.join(",")}], found [${value.join(",")}]`);
}

export function patchSubjects({
  files,
  patches,
  dryRun = false,
}: {
  files: SubjectFile[];
  patches: SubjectPatch[];
  dryRun?: boolean;
}): PatchResult {
  const index = new Map<number, { record: SubjectRecord; file: SubjectFile }>();
  for (const file of files) {
    for (const record of file.subjects) {
      index.set(record.id, { record, file });
    }
  }

  const statuses = patches.map((patch) => checkPatch(patch, index.get(patch.subject)?.record));
  if (statuses.some((status) => status.kind === "fail")) {
    return { ok: false, statuses, writes: [] };
  }
  if (dryRun) return { ok: true, statuses, writes: [] };

  const changed = new Set<SubjectFile>();
  for (const status of statuses) {
    if (status.kind !== "apply") continue;
    const found = index.get(status.patch.subject);
    if (!found) continue;
    found.record.data[status.patch.field] = [...status.patch.set];
    changed.add(found.file);
  }

  return { ok: true, statuses, writes: files.filter((file) => changed.has(file)) };
}

export function formatStatusLine(status: PatchStatus): string {
  const head = [
    String(status.patch.subject).padEnd(5),
    (status.characters ?? "?").padEnd(3),
    status.patch.field.padEnd(25),
  ].join(" ");
  if (status.kind === "fail") return `  ${head} FAIL  ${status.reason}`;
  return `  ${head} ${status.kind}`;
}

function toPatch(entry: unknown, index: number): SubjectPatch {
  const at = `wanikani fixes: patch ${index + 1}`;
  if (!isRecord(entry)) throw new Error(`${at} must be a mapping`);

  const { subject, seen, field } = entry;
  if (typeof subject !== "number" || !Number.isInteger(subject)) {
    throw new Error(`${at} needs a whole number \`subject\``);
  }
  if (typeof seen !== "string" || seen.length === 0) {
    throw new Error(`${at} (subject ${subject}) needs a non-empty \`seen\``);
  }
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`${at} (subject ${subject}) needs a non-empty \`field\``);
  }

  const where = `${at} (subject ${subject}, ${field})`;
  const expect = toIdList(entry.expect, `${where} \`expect\``);
  const set = toIdList(entry.set, `${where} \`set\``);
  if (sameIds(expect, set)) {
    throw new Error(`${where} has \`expect\` equal to \`set\`, so it would never settle`);
  }

  return { subject, seen, field, expect, set };
}

function toIdList(value: unknown, where: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where} must be a non-empty list of ids`);
  }
  if (!value.every((id) => typeof id === "number" && Number.isInteger(id))) {
    throw new Error(`${where} must hold whole numbers only`);
  }
  return value;
}

function rejectDuplicates(patches: SubjectPatch[]): void {
  const firstIndexByTarget = new Map<string, number>();
  patches.forEach((patch, index) => {
    const target = `${patch.subject}:${patch.field}`;
    const first = firstIndexByTarget.get(target);
    if (first !== undefined) {
      throw new Error(
        `wanikani fixes: patches ${first + 1} and ${index + 1} both target ${target}, their guards would fight`
      );
    }
    firstIndexByTarget.set(target, index);
  });
}

function readCharacters(subject: SubjectRecord | undefined): string | null {
  if (!subject) return null;
  const { characters, slug } = subject.data;
  if (typeof characters === "string") return characters;
  if (typeof slug === "string") return slug;
  return null;
}

function sameIds(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
