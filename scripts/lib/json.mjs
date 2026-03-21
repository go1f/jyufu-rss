import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export async function readJson(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJson(path, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(path.dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
