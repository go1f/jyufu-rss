# Collector Plan

这个目录预留给本机采集逻辑。

## 推荐职责划分

建议拆成三层：

1. `sources/`
   平台适配器。每个平台一个独立模块。

2. `normalize/`
   把不同来源的数据映射为统一结构。

3. `publish/`
   把统一结构写入 `site/data/`，并生成 RSS / Atom 文件。

## 建议的统一数据结构

```json
{
  "id": "weibo:tombkeeper:202603210001",
  "source": "weibo",
  "author": "tombkeeper",
  "title": "示例标题",
  "summary": "示例摘要",
  "url": "https://example.com/post/1",
  "publishedAt": "2026-03-21T08:00:00+08:00",
  "tags": ["security", "commentary"]
}
```

## 后续对接建议

### 微博

- 上游来源优先接 RSSHub
- 从 RSSHub 的 RSS 或 JSON 输出拉取
- 转换为统一结构

### 公众号

- 上游来源优先接公开镜像页、WeWe RSS 或 WeRSS
- 从生成的 feed 或文章镜像页中解析标题、链接、摘要和发布时间
- 转换为统一结构

## 输出目标

最终建议生成这些文件：

- `site/data/feeds.json`
- `site/data/meta.json`
- `site/feeds/all.xml`
- `site/feeds/weibo-tombkeeper.xml`
- `site/feeds/wechat-*.xml`

这样 GitHub Pages 既能给浏览器看，也能给阅读器订阅。

## 当前已落地来源

### `weibo-tombkeeper`

- 配置文件：`collector/sources.json`
- 默认上游：`https://rsshub.app/weibo/user/1401527553`
- 环境变量覆盖：`WEIBO_TOMBKEEPER_FEED_URL`

考虑到 RSSHub 公共实例经常被反爬或限流，构建脚本支持：

- 抓取失败时保留旧数据
- 通过环境变量无缝切换到你自己的 RSSHub 实例

### `wechat-rockhazix`

- 配置文件：`collector/sources.json`
- 当前上游：`https://qnmlgb.tech/authors/689d376c11bb95417ae3553b`
- 抓取方式：作者页抓公开列表，文章页补抓详情
- 当前边界：只能拿到镜像站公开可见的公众号文章
