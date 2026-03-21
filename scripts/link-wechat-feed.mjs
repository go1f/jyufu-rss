import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./lib/paths.mjs";

const targetName = process.argv[2] || "数字生命卡兹克";
const feedsApi = process.env.WEWE_FEEDS_API || "http://127.0.0.1:4000/feeds";
const feedMode = process.env.WEWE_FEED_MODE || "fulltext";
const envFile = path.join(repoRoot, ".env.local");

async function main() {
  const response = await fetch(feedsApi, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${feedsApi}`);
  }

  const feeds = await response.json();
  const match = feeds.find((item) => item.name === targetName);

  if (!match) {
    throw new Error(`No WeWe feed named "${targetName}" found at ${feedsApi}`);
  }

  const feedUrl = `http://127.0.0.1:4000/feeds/${match.id}.rss?mode=${feedMode}`;
  let content = "";

  try {
    content = await readFile(envFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const nextLine = `WECHAT_ROCKHAZIX_FEED_URL="${feedUrl}"`;
  const hasLine = /^WECHAT_ROCKHAZIX_FEED_URL=.*$/m.test(content);
  const nextContent = hasLine
    ? content.replace(/^WECHAT_ROCKHAZIX_FEED_URL=.*$/m, nextLine)
    : `${content}${content.endsWith("\n") || content.length === 0 ? "" : "\n"}${nextLine}\n`;

  await writeFile(envFile, nextContent, "utf8");
  console.log(`Updated .env.local with ${feedUrl}`);
}

await main();
