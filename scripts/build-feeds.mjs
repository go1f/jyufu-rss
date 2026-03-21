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

function decodeHtmlEntities(input) {
  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(input) {
  return decodeHtmlEntities(input)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readMatch(input, pattern) {
  const match = input.match(pattern);
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function readMetaContent(input, selectorName, selectorValue) {
  const tags = input.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const selector = tag.match(
      new RegExp(`${selectorName}\\s*=\\s*["']${selectorValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i")
    );
    if (!selector) {
      continue;
    }

    const content = tag.match(/content\s*=\s*["']([\s\S]*?)["']/i);
    if (content) {
      return decodeHtmlEntities(content[1].trim());
    }
  }

  return "";
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

function slugifySourceId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function normalizePrebuiltItem(source, item) {
  const itemTags = unique([
    ...(source.tags ?? []),
    ...(item.tags ?? []),
    ...extractHashtags(item.title || ""),
    ...extractHashtags(item.summary || ""),
  ]);

  return {
    id: item.id || item.url || `${source.id}:${item.title}`,
    source: source.type,
    sourceId: source.id,
    sourceLabel: source.sourceLabel,
    author: item.author || source.name,
    title: item.title || "(无标题)",
    summary: item.summary || "暂无摘要",
    contentHtml: item.contentHtml || "",
    url: item.url || source.homepage,
    publishedAt: toIsoDate(item.publishedAt),
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
  const staticSources = await readJson(file, []);
  const weweSources = useFixture ? [] : await loadWeweSourceDefinitions(staticSources);
  return [...staticSources, ...weweSources];
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

function getWeweFeedsApi() {
  return process.env.WEWE_FEEDS_API || "http://127.0.0.1:4000/feeds";
}

async function loadWeweSourceDefinitions(existingSources) {
  const api = getWeweFeedsApi();
  let feeds;

  try {
    const response = await fetch(api, {
      headers: {
        "user-agent": "jyufu-rss/0.1 (+https://github.com/)",
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${api}`);
    }

    feeds = await response.json();
  } catch {
    return [];
  }

  const existingNames = new Set(existingSources.map((source) => source.name));

  return feeds
    .filter((feed) => !existingNames.has(feed.name))
    .map((feed) => {
      const sourceId = slugifySourceId(feed.id || feed.name) || `wechat-${Date.now()}`;
      return {
        id: `wechat-${sourceId}`,
        name: feed.name,
        type: "wechat",
        sourceLabel: "微信公众号",
        homepage: `http://127.0.0.1:4000/feeds/${feed.id}.rss?mode=fulltext`,
        upstreamUrl: `http://127.0.0.1:4000/feeds/${feed.id}.rss?mode=fulltext`,
        maxItems: 10,
        tags: unique(["wechat", "公众号", feed.name]),
      };
    });
}

async function fetchRssSourceItems(source, location = selectLocation(source)) {
  const xml = await readTextFromLocation(location);
  const rawItems = parseRssItems(xml).slice(0, source.maxItems ?? 20);
  const items = rawItems.map((item) => normalizeItem(source, item));
  return {
    location,
    items,
  };
}

async function fetchSourceItems(source) {
  if (source.type === "wechat-mirror") {
    const rssLocation = source.rssUpstreamEnv ? process.env[source.rssUpstreamEnv] : "";
    if (rssLocation) {
      return fetchRssSourceItems({ ...source, type: "wechat" }, rssLocation);
    }

    return fetchWechatMirrorItems(source);
  }

  return fetchRssSourceItems(source);
}

function parseWechatMirrorList(html, baseUrl) {
  const matches = html.matchAll(
    /<div class="ae"[^>]*data-id="([^"]+)"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span style="font-size:\s*12px">([^<]+)<\/span>[\s\S]*?<span class="pretty">([\s\S]*?)<\/span>/gi
  );

  return [...matches].map((match) => ({
    id: match[1],
    url: new URL(match[2], baseUrl).toString(),
    dateLabel: decodeHtmlEntities(match[3].trim()),
    preview: stripHtml(match[4]),
  }));
}

function buildWechatContentHtml(summary, imageUrl) {
  const parts = [];

  if (imageUrl) {
    parts.push(`<p><img src="${escapeHtml(imageUrl)}" alt="文章配图"></p>`);
  }

  if (summary) {
    parts.push(`<p>${escapeHtml(summary)}</p>`);
  }

  return parts.join("");
}

function parseWechatMirrorArticle(source, article, html) {
  const title =
    readMatch(html, /<h4[^>]*>([\s\S]*?)<\/h4>/i) ||
    readMetaContent(html, "property", "og:title").replace(/\s*-\s*瓦斯阅读$/, "");
  const author =
    readMatch(html, /<a[^>]+href="\/authors\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i) || source.name;
  const publishedAt =
    readMetaContent(html, "property", "og:release_date") ||
    readMatch(html, /<span style="margin-left:\s*10px;">([\s\S]*?)<\/span>/i);
  const summary =
    readMetaContent(html, "property", "og:description") ||
    readMetaContent(html, "name", "description") ||
    article.preview;
  const imageUrl = readMetaContent(html, "property", "og:image");
  const contentHtml = readMatch(
    html,
    /<div class="rich_media_content"[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>/i
  );

  return normalizePrebuiltItem(source, {
    id: article.id,
    author,
    title,
    summary,
    contentHtml: contentHtml || buildWechatContentHtml(summary, imageUrl),
    url: article.url,
    publishedAt,
    tags: ["wechat"],
  });
}

async function fetchWechatMirrorItems(source) {
  const location = source.authorPageUrl || source.homepage;
  const authorHtml = await readTextFromLocation(location);
  const articleList = parseWechatMirrorList(authorHtml, location).slice(0, source.maxItems ?? 10);

  const items = await Promise.all(
    articleList.map(async (article) => {
      try {
        const articleHtml = await readTextFromLocation(article.url);
        return parseWechatMirrorArticle(source, article, articleHtml);
      } catch {
        return normalizePrebuiltItem(source, {
          id: article.id,
          title: article.preview,
          summary: article.preview,
          url: article.url,
          publishedAt: article.dateLabel,
          tags: ["wechat"],
        });
      }
    })
  );

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
