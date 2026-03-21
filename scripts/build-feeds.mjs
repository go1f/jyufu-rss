import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectorDir, dataDir, feedsDir } from "./lib/paths.mjs";
import { readJson } from "./lib/json.mjs";
import { buildRssFeed, parseRssItems } from "./lib/rss.mjs";

const args = new Set(process.argv.slice(2));
const useFixture = args.has("--fixture");

async function readTextFromLocation(location) {
  if (location.startsWith("file://")) {
    return readFile(new URL(location), "utf8");
  }

  const response = await fetch(location, {
    headers: {
      "user-agent": "jyufu-rss/0.1 (+https://github.com/)",
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${location}`);
  }

  return response.text();
}

function getSiteUrl() {
  return process.env.SITE_URL || "https://example.com";
}

function toIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractHashtags(text) {
  return [...text.matchAll(/#([^#\s]+)#/g)].map((match) => match[1]);
}

function normalizeItem(source, item) {
  const itemTags = unique([
    ...(source.tags ?? []),
    ...(item.categories ?? []),
    ...extractHashtags(item.title || ""),
    ...extractHashtags(item.description || ""),
  ]);

  return {
    id: item.guid || item.link || `${source.id}:${item.title}`,
    source: source.type,
    sourceId: source.id,
    sourceLabel: source.sourceLabel,
    author: item.author || source.name,
    title: item.title || "(无标题)",
    summary: item.description || "暂无摘要",
    contentHtml: item.descriptionHtml || "",
    url: item.link || source.homepage,
    publishedAt: toIsoDate(item.pubDate),
    tags: itemTags,
  };
}

function dedupeAndSort(items) {
  const byId = new Map();

  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()].sort((a, b) => {
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

async function loadSourceDefinitions() {
  const file = path.join(collectorDir, "sources.json");
  return readJson(file, []);
}

async function loadExistingFeeds() {
  const file = path.join(dataDir, "feeds.json");
  const existing = await readJson(file, { items: [] });
  return Array.isArray(existing.items) ? existing.items : [];
}

function selectLocation(source) {
  if (useFixture) {
    return `file://${path.join(collectorDir, "fixtures", "weibo-tombkeeper.xml")}`;
  }

  return process.env[source.upstreamEnv] || source.upstreamUrl;
}

async function fetchSourceItems(source) {
  const location = selectLocation(source);
  const xml = await readTextFromLocation(location);
  const rawItems = parseRssItems(xml).slice(0, source.maxItems ?? 20);
  const items = rawItems.map((item) => normalizeItem(source, item));
  return {
    location,
    items,
  };
}

async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

function buildSourceMeta(source, info, itemCount, errorMessage) {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    homepage: source.homepage,
    upstreamUrl: info.location,
    itemCount,
    status: errorMessage ? "degraded" : "ok",
    lastCheckedAt: new Date().toISOString(),
    lastError: errorMessage || null,
  };
}

export async function buildFeeds() {
  const sources = await loadSourceDefinitions();
  const existingItems = await loadExistingFeeds();
  const nextItems = [];
  const metaSources = [];
  const siteUrl = getSiteUrl();

  for (const source of sources) {
    try {
      const fetched = await fetchSourceItems(source);
      nextItems.push(...fetched.items);
      metaSources.push(buildSourceMeta(source, fetched, fetched.items.length, null));
    } catch (error) {
      const fallbackItems = existingItems.filter((item) => item.sourceId === source.id);
      nextItems.push(...fallbackItems);
      metaSources.push(
        buildSourceMeta(
          source,
          { location: selectLocation(source) },
          fallbackItems.length,
          error.message
        )
      );
    }
  }

  const items = dedupeAndSort(nextItems);
  const meta = {
    siteTitle: "JYUFU RSS",
    siteUrl,
    updatedAt: new Date().toISOString(),
    sources: metaSources,
  };

  const feedsJson = { items };
  const allXml = buildRssFeed({
    title: "JYUFU RSS",
    link: siteUrl,
    description: "A personal static feed hub published via GitHub Pages.",
    items,
  });

  await writeJsonFile(path.join(dataDir, "meta.json"), meta);
  await writeJsonFile(path.join(dataDir, "feeds.json"), feedsJson);
  await writeTextFile(path.join(feedsDir, "all.xml"), allXml);

  for (const source of sources) {
    const sourceItems = items.filter((item) => item.sourceId === source.id);
    const xml = buildRssFeed({
      title: `${source.name} - JYUFU RSS`,
      link: source.homepage,
      description: `${source.name} aggregated by JYUFU RSS.`,
      items: sourceItems,
    });
    await writeTextFile(path.join(feedsDir, `${source.id}.xml`), xml);
  }

  return { items, meta };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await buildFeeds();
  console.log(`Updated ${result.items.length} items across ${result.meta.sources.length} sources.`);
}
