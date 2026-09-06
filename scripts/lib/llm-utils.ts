import { readFile, rename, unlink, writeFile } from "fs/promises";
import type OpenAI from "openai";
import { formatError } from "./format-error.ts";

export type JsonAnswer =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string };

export async function askForJsonObject(params: {
  client: OpenAI;
  model: string;
  prompt: string;
}): Promise<JsonAnswer> {
  let text: string;
  try {
    const completion = await params.client.chat.completions.create({
      model: params.model,
      messages: [{ role: "user", content: params.prompt }],
      temperature: 0,
    });
    text = completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    return { success: false, error: `API error: ${formatError(error)}` };
  }

  const data = parseJsonObject(text);
  if (!data) {
    const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
    return { success: false, error: `No JSON object in the answer: ${preview}` };
  }
  return { success: true, data };
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadJsonFile<T>(path: string): Promise<Record<string, T>> {
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return {};
    throw error;
  }
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) throw new Error(`${path} must hold a JSON object`);
  return parsed as Record<string, T>;
}

export async function saveJsonAtomic(path: string, data: unknown): Promise<void> {
  const tempPath = `${path}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(data, null, 2) + "\n");
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
