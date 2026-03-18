const BASE_URL = "https://api.wanikani.com/v2";
const API_REVISION = "20170710";
const RATE_LIMIT_MS = 1000;
const DATA_DIR = "./data/userdata";

type SubjectType = "radical" | "kanji" | "vocabulary" | "kana_vocabulary";

interface WanikaniSubject {
  id: number;
  object: SubjectType;
  url: string;
  data_updated_at: string;
  data: Record<string, unknown>;
}

interface WanikaniResponse {
  object: string;
  url: string;
  pages: {
    next_url: string | null;
    previous_url: string | null;
    per_page: number;
  };
  total_count: number;
  data_updated_at: string;
  data: WanikaniSubject[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string, token: string): Promise<WanikaniResponse> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Wanikani-Revision": API_REVISION,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAllSubjects(token: string): Promise<WanikaniSubject[]> {
  const subjects: WanikaniSubject[] = [];
  let nextUrl: string | null = `${BASE_URL}/subjects`;
  let page = 1;

  while (nextUrl) {
    console.log(`Fetching page ${page}...`);
    const response = await fetchPage(nextUrl, token);

    subjects.push(...response.data);
    console.log(
      `  Got ${response.data.length} subjects (total: ${subjects.length}/${response.total_count})`
    );

    nextUrl = response.pages.next_url;

    if (nextUrl) {
      await sleep(RATE_LIMIT_MS);
    }
    page++;
  }

  return subjects;
}

function groupByType(subjects: WanikaniSubject[]): Record<SubjectType, WanikaniSubject[]> {
  const grouped: Record<SubjectType, WanikaniSubject[]> = {
    radical: [],
    kanji: [],
    vocabulary: [],
    kana_vocabulary: [],
  };

  for (const subject of subjects) {
    if (subject.object in grouped) {
      grouped[subject.object].push(subject);
    }
  }

  return grouped;
}

async function saveToFiles(grouped: Record<SubjectType, WanikaniSubject[]>): Promise<void> {
  await Bun.write(`${DATA_DIR}/.gitkeep`, "");

  const fileNames: Record<SubjectType, string> = {
    radical: "radicals.json",
    kanji: "kanji.json",
    vocabulary: "vocabulary.json",
    kana_vocabulary: "kana_vocabulary.json",
  };

  for (const [type, subjects] of Object.entries(grouped)) {
    const fileName = fileNames[type as SubjectType];
    const filePath = `${DATA_DIR}/${fileName}`;
    await Bun.write(filePath, JSON.stringify(subjects, null, 2));
    console.log(`Saved ${subjects.length} ${type} subjects to ${filePath}`);
  }
}

async function main(): Promise<void> {
  const token = process.env.WANIKANI_API_TOKEN;

  if (!token) {
    console.error("Error: WANIKANI_API_TOKEN environment variable is not set");
    console.error("Please set it in scripts/.env");
    process.exit(1);
  }

  console.log("Starting Wanikani subjects download...\n");

  const subjects = await fetchAllSubjects(token);
  console.log(`\nDownloaded ${subjects.length} subjects total\n`);

  const grouped = groupByType(subjects);
  await saveToFiles(grouped);

  console.log("\nDone!");
}

main().catch(console.error);
