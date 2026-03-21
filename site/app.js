const state = {
  source: "all",
  tag: "all",
  expandedSummaries: new Set(),
  expandedDetails: new Set(),
};

let viewModel = {
  meta: null,
  items: [],
};

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isSafeUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function unwrapNode(node) {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }

  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  node.remove();
}

function sanitizeTree(root) {
  const allowedTags = new Set([
    "A",
    "BLOCKQUOTE",
    "BR",
    "DIV",
    "EM",
    "H3",
    "IMG",
    "LI",
    "OL",
    "P",
    "SMALL",
    "SOURCE",
    "SPAN",
    "STRONG",
    "UL",
    "VIDEO",
  ]);

  const allowedAttributes = {
    A: new Set(["href"]),
    IMG: new Set(["src", "alt"]),
    SOURCE: new Set(["src"]),
    VIDEO: new Set(["src", "poster", "controls"]),
  };

  for (const child of [...root.children]) {
    sanitizeTree(child);
  }

  if (root.tagName === "STYLE" || root.tagName === "SCRIPT") {
    root.remove();
    return;
  }

  if (!allowedTags.has(root.tagName)) {
    unwrapNode(root);
    return;
  }

  for (const attribute of [...root.attributes]) {
    const tagAttributes = allowedAttributes[root.tagName];
    const keep = tagAttributes?.has(attribute.name) ?? false;
    if (!keep) {
      root.removeAttribute(attribute.name);
    }
  }

  if (root.tagName === "A") {
    const href = root.getAttribute("href");
    if (!isSafeUrl(href)) {
      root.removeAttribute("href");
    } else {
      root.setAttribute("target", "_blank");
      root.setAttribute("rel", "noreferrer noopener");
    }
  }

  if (root.tagName === "IMG") {
    const src = root.getAttribute("src");
    if (!isSafeUrl(src)) {
      root.remove();
      return;
    }
    root.setAttribute("loading", "lazy");
  }

  if (root.tagName === "SOURCE") {
    const src = root.getAttribute("src");
    if (!isSafeUrl(src)) {
      root.remove();
    }
  }

  if (root.tagName === "VIDEO") {
    const src = root.getAttribute("src");
    const poster = root.getAttribute("poster");
    if (src && !isSafeUrl(src)) {
      root.removeAttribute("src");
    }
    if (poster && !isSafeUrl(poster)) {
      root.removeAttribute("poster");
    }
    root.setAttribute("controls", "controls");
  }
}

function parseRichContent(rawHtml) {
  if (!rawHtml) {
    return {
      contentHtml: "",
      commentsHtml: "",
      commentCount: 0,
      imageUrls: [],
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${rawHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild;

  if (!root) {
    return {
      contentHtml: "",
      commentsHtml: "",
      commentCount: 0,
      imageUrls: [],
    };
  }

  sanitizeTree(root);

  const commentHeading = [...root.querySelectorAll("h3")].find((node) =>
    node.textContent.includes("热门评论")
  );

  let commentsHtml = "";
  let commentCount = 0;
  if (commentHeading) {
    const commentSection = commentHeading.parentElement;
    if (commentSection) {
      commentCount = commentSection.querySelectorAll("p").length;
      commentsHtml = commentSection.innerHTML.trim();
      commentSection.remove();
    }
  }

  const imageUrls = unique(
    [...root.querySelectorAll("img")]
      .map((node) => node.getAttribute("src"))
      .filter((src) => isSafeUrl(src))
  );

  for (const image of [...root.querySelectorAll("img")]) {
    image.remove();
  }

  return {
    contentHtml: root.innerHTML.trim(),
    commentsHtml,
    commentCount,
    imageUrls,
  };
}

function enrichItem(item) {
  const rich = parseRichContent(item.contentHtml);
  return {
    ...item,
    rich,
    summaryLength: item.summary.length,
    isWechat: item.source === "wechat" || item.source === "wechat-mirror",
  };
}

function getVisibleItems() {
  return viewModel.items.filter((item) => {
    const sourceMatches = state.source === "all" || item.sourceId === state.source;
    const tagMatches = state.tag === "all" || item.tags.includes(state.tag);
    return sourceMatches && tagMatches;
  });
}

function getTagStats(items) {
  const counts = new Map();

  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"));
}

function renderMeta(meta) {
  const container = document.getElementById("site-meta");
  const visibleCount = getVisibleItems().length;

  container.innerHTML = "";

  const pills = [
    `站点: ${meta.siteTitle}`,
    `来源: ${meta.sources.length}`,
    `结果: ${visibleCount}`,
    `更新于: ${formatDate(meta.updatedAt)}`,
  ];

  for (const text of pills) {
    const span = document.createElement("span");
    span.textContent = text;
    container.appendChild(span);
  }
}

function renderFilterButtons(container, entries, activeValue, onClick) {
  container.innerHTML = "";

  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.dataset.count = entry.count;
    if (entry.value === activeValue) {
      button.classList.add("active");
    }
    button.textContent = entry.label;
    button.addEventListener("click", () => onClick(entry.value));
    container.appendChild(button);
  }
}

function renderFilters(meta, items) {
  const sourceContainer = document.getElementById("source-filters");
  const tagContainer = document.getElementById("tag-filters");

  const sourceEntries = [
    { value: "all", label: "全部来源", count: items.length },
    ...meta.sources.map((source) => ({
      value: source.id,
      label: source.name,
      count: items.filter((item) => item.sourceId === source.id).length,
    })),
  ];

  const tagEntries = [
    { value: "all", label: "全部 Topics", count: items.length },
    ...getTagStats(items),
  ];

  renderFilterButtons(sourceContainer, sourceEntries, state.source, (value) => {
    state.source = value;
    renderAll();
  });

  renderFilterButtons(tagContainer, tagEntries, state.tag, (value) => {
    state.tag = value;
    renderAll();
  });
}

function renderSubscriptions(meta) {
  const container = document.getElementById("subscription-links");
  container.innerHTML = "";

  const entries = [
    { label: "数据 JSON", href: "./data/feeds.json" },
    { label: "全量 RSS", href: "./feeds/all.xml" },
    ...meta.sources.map((source) => ({
      label: `${source.name} RSS`,
      href: `./feeds/${source.id}.xml`,
    })),
  ];

  for (const entry of entries) {
    const link = document.createElement("a");
    link.className = "subscription-link";
    link.href = entry.href;
    link.textContent = entry.label;
    container.appendChild(link);
  }
}

function renderImageGallery(container, imageUrls) {
  container.innerHTML = "";
  container.hidden = imageUrls.length === 0;

  for (const url of imageUrls.slice(0, 4)) {
    const link = document.createElement("a");
    link.className = "media-thumb";
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";

    const image = document.createElement("img");
    image.src = url;
    image.alt = "内容配图";
    image.loading = "lazy";

    link.appendChild(image);
    container.appendChild(link);
  }
}

function renderFeeds(items) {
  const list = document.getElementById("feed-list");
  const template = document.getElementById("item-template");

  list.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "loading";
    empty.textContent = "当前筛选条件下没有结果。";
    list.appendChild(empty);
    return;
  }

  for (const item of items) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const titleLink = node.querySelector(".title-link");
    const title = node.querySelector(".title");
    const summary = node.querySelector(".summary");
    const summaryToggle = node.querySelector(".summary-toggle");
    const detailBlock = node.querySelector(".detail-block");
    const detailToggle = node.querySelector(".detail-toggle");
    const content = node.querySelector(".content");
    const comments = node.querySelector(".comments");
    const commentsBody = node.querySelector(".comments-body");
    const commentsTitle = node.querySelector(".comments-title");
    const mediaGrid = node.querySelector(".media-grid");
    const actions = node.querySelector(".actions");

    const hasDetail = !item.isWechat && Boolean(item.rich.contentHtml || item.rich.commentsHtml);
    const needsSummaryToggle = item.summaryLength > 180;

    card.dataset.itemId = item.id;
    node.querySelector(".source").textContent = item.sourceLabel;
    node.querySelector(".time").textContent = formatDate(item.publishedAt);
    node.querySelector(".author").textContent = `作者: ${item.author}`;

    title.textContent = item.title;
    titleLink.href = item.url;

    summary.textContent = item.summary;
    if (!state.expandedSummaries.has(item.id)) {
      summary.classList.add("clamped");
    }

    if (item.isWechat) {
      mediaGrid.hidden = true;
      mediaGrid.innerHTML = "";
    } else {
      renderImageGallery(mediaGrid, item.rich.imageUrls);
    }

    summaryToggle.hidden = !needsSummaryToggle;
    if (needsSummaryToggle) {
      summaryToggle.textContent = state.expandedSummaries.has(item.id) ? "收起摘要" : "展开摘要";
      summaryToggle.addEventListener("click", () => {
        if (state.expandedSummaries.has(item.id)) {
          state.expandedSummaries.delete(item.id);
        } else {
          state.expandedSummaries.add(item.id);
        }
        renderAll();
      });
    }

    actions.hidden = !hasDetail;
    detailToggle.hidden = !hasDetail;
    detailBlock.hidden = !hasDetail || !state.expandedDetails.has(item.id);

    if (hasDetail) {
      const hasComments = item.rich.commentCount > 0;
      detailToggle.textContent = state.expandedDetails.has(item.id)
        ? "收起正文"
        : hasComments
          ? `展开正文与评论 (${item.rich.commentCount})`
          : "展开正文";
      detailToggle.addEventListener("click", () => {
        if (state.expandedDetails.has(item.id)) {
          state.expandedDetails.delete(item.id);
        } else {
          state.expandedDetails.add(item.id);
        }
        renderAll();
      });

      content.innerHTML = item.rich.contentHtml;
      comments.hidden = !item.rich.commentsHtml;
      commentsTitle.textContent = `热门评论 (${item.rich.commentCount})`;
      commentsBody.innerHTML = item.rich.commentsHtml;
    } else {
      detailBlock.hidden = true;
      content.innerHTML = "";
      comments.hidden = true;
      commentsBody.innerHTML = "";
    }

    list.appendChild(node);
  }
}

function renderAll() {
  renderMeta(viewModel.meta);
  renderSubscriptions(viewModel.meta);
  renderFilters(viewModel.meta, viewModel.items);
  renderFeeds(getVisibleItems());
}

async function main() {
  try {
    const [meta, feeds] = await Promise.all([
      loadJson("./data/meta.json"),
      loadJson("./data/feeds.json"),
    ]);

    viewModel = {
      meta,
      items: feeds.items.map(enrichItem),
    };

    renderAll();
  } catch (error) {
    const list = document.getElementById("feed-list");
    list.innerHTML = "";
    const p = document.createElement("p");
    p.className = "loading";
    p.textContent = `加载失败: ${error.message}`;
    list.appendChild(p);
  }
}

main();
