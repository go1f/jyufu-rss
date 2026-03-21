function decodeXmlEntities(input) {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripCdata(input) {
  return input.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripHtml(input) {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCommentSection(input) {
  return input
    .replace(
      /<br\s+clear=["']both["']\s*>\s*<div[^>]*><\/div>\s*<div[^>]*>\s*<h3>热门评论<\/h3>[\s\S]*$/i,
      ""
    )
    .replace(/<div[^>]*>\s*<h3>热门评论<\/h3>[\s\S]*$/i, "")
    .trim();
}

function readTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) {
    return "";
  }

  return decodeXmlEntities(stripCdata(match[1].trim()));
}

function readTags(block, tagName) {
  const matches = block.matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  return [...matches].map((match) => decodeXmlEntities(stripCdata(match[1].trim()))).filter(Boolean);
}

export function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const descriptionHtml = readTag(block, "description");
    const contentOnlyHtml = stripCommentSection(descriptionHtml);
    items.push({
      guid: readTag(block, "guid"),
      title: readTag(block, "title"),
      link: readTag(block, "link"),
      author: readTag(block, "author"),
      pubDate: readTag(block, "pubDate"),
      description: stripHtml(contentOnlyHtml),
      descriptionHtml,
      categories: readTags(block, "category"),
    });
  }

  return items;
}

function escapeXml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRssFeed({ title, link, description, items }) {
  const body = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid>${escapeXml(item.id)}</guid>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
      <description>${escapeXml(item.summary)}</description>
      <author>${escapeXml(item.author)}</author>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${body}
  </channel>
</rss>
`;
}
