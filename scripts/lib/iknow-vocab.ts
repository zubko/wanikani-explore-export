export type IknowItem = {
  word: string;
  reading: string;
};

export type VocabProblem = {
  word: string;
  reading: string;
  file: string;
  index: number;
  reason: "not_found" | "error";
  error?: string;
};

export type VocabStatus = {
  current: string;
  files: Record<string, { index: number; done?: boolean }>;
  problems: VocabProblem[];
};

export function createInitialStatus(firstFile: string): VocabStatus {
  return { current: firstFile, files: {}, problems: [] };
}

export function parseCourseFiles(series: unknown): string[] {
  const courses = (series as { courses?: unknown })?.courses;
  if (!Array.isArray(courses)) {
    throw new Error("Series file has no courses array");
  }
  return courses.map((course, i) => {
    const file = (course as { file?: unknown })?.file;
    if (typeof file !== "string") {
      throw new Error(`Series course ${i} has no file name`);
    }
    return file;
  });
}

export function parseGoalItems(course: unknown): IknowItem[] {
  const goalItems = (course as { goal_items?: unknown })?.goal_items;
  if (!Array.isArray(goalItems)) {
    throw new Error("Course file has no goal_items array");
  }

  return goalItems.map((entry, i) => {
    const cue = (entry as { item?: { cue?: unknown } })?.item?.cue;
    const text = (cue as { text?: unknown })?.text;
    if (typeof text !== "string") {
      throw new Error(`Course item ${i} has no item.cue.text`);
    }
    const reading = (cue as { transliterations?: { Hrkt?: unknown } })?.transliterations?.Hrkt;
    return { word: text, reading: typeof reading === "string" ? reading : "" };
  });
}

export function rollOverToNextFile(params: {
  status: VocabStatus;
  courseFiles: string[];
  itemCount: number;
}): { status: VocabStatus; nextFile: string | null } {
  const { status, courseFiles, itemCount } = params;
  const current = status.current;

  const position = courseFiles.indexOf(current);
  if (position === -1) {
    throw new Error(`Current file ${current} is not in the series`);
  }
  const nextFile = courseFiles[position + 1] ?? null;

  const files = { ...status.files, [current]: { index: itemCount, done: true } };
  if (nextFile) {
    // a stale entry here would skip words, and a stale done:true would stall every later run
    files[nextFile] = { index: 0 };
  }

  return {
    status: { ...status, current: nextFile ?? current, files },
    nextFile,
  };
}
