const BASE_URL = "https://api.wanikani.com/v2";
const API_REVISION = "20170710";
const RATE_LIMIT_MS = 1000;
const OUTPUT_FILE = "./data/userdata/study_materials.json";

interface StudyMaterial {
  id: number;
  object: "study_material";
  url: string;
  data_updated_at: string;
  data: {
    created_at: string;
    subject_id: number;
    subject_type: string;
    meaning_note: string | null;
    reading_note: string | null;
    meaning_synonyms: string[];
    hidden: boolean;
  };
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
  data: StudyMaterial[];
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

async function fetchAllStudyMaterials(token: string): Promise<StudyMaterial[]> {
  const materials: StudyMaterial[] = [];
  let nextUrl: string | null = `${BASE_URL}/study_materials`;
  let page = 1;

  while (nextUrl) {
    console.log(`Fetching page ${page}...`);
    const response = await fetchPage(nextUrl, token);

    materials.push(...response.data);
    console.log(
      `  Got ${response.data.length} study materials (total: ${materials.length}/${response.total_count})`
    );

    nextUrl = response.pages.next_url;

    if (nextUrl) {
      await sleep(RATE_LIMIT_MS);
    }
    page++;
  }

  return materials;
}

async function main(): Promise<void> {
  const token = process.env.WANIKANI_API_TOKEN;

  if (!token) {
    console.error("Error: WANIKANI_API_TOKEN environment variable is not set");
    console.error("Please set it in scripts/.env");
    process.exit(1);
  }

  console.log("Starting Wanikani study materials download...\n");

  const materials = await fetchAllStudyMaterials(token);
  console.log(`\nDownloaded ${materials.length} study materials total\n`);

  await Bun.write(OUTPUT_FILE, JSON.stringify(materials, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);

  console.log("\nDone!");
}

main().catch(console.error);
