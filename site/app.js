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

function renderMeta(meta, feeds) {
  const container = document.getElementById("site-meta");
  const itemCount = Array.isArray(feeds.items) ? feeds.items.length : 0;

  container.innerHTML = "";

  const pills = [
    `站点: ${meta.siteTitle}`,
    `来源数: ${meta.sources.length}`,
    `条目数: ${itemCount}`,
    `更新时间: ${formatDate(meta.updatedAt)}`,
  ];

  for (const text of pills) {
    const span = document.createElement("span");
    span.textContent = text;
    container.appendChild(span);
  }
}

function renderFeeds(feeds) {
  const list = document.getElementById("feed-list");
  const template = document.getElementById("item-template");

  list.innerHTML = "";

  if (!feeds.items || feeds.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "loading";
    empty.textContent = "还没有已发布条目。";
    list.appendChild(empty);
    return;
  }

  for (const item of feeds.items) {
    const node = template.content.cloneNode(true);
    node.querySelector(".source").textContent = item.sourceLabel;
    node.querySelector(".time").textContent = formatDate(item.publishedAt);
    node.querySelector(".title").textContent = item.title;
    node.querySelector(".summary").textContent = item.summary;
    node.querySelector(".author").textContent = `作者: ${item.author}`;
    const link = node.querySelector(".link");
    link.href = item.url;
    list.appendChild(node);
  }
}

async function main() {
  try {
    const [meta, feeds] = await Promise.all([
      loadJson("./data/meta.json"),
      loadJson("./data/feeds.json"),
    ]);

    renderMeta(meta, feeds);
    renderFeeds(feeds);
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
