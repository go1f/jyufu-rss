# jyufu-rss

一个适合单机常开电脑使用的个人资讯中台原型。

目标是把本机采集到的内容发布为：

- 一个适合手机浏览的静态首页
- 若干可订阅的 RSS / Atom / JSON 文件
- 一个可以直接托管到 GitHub Pages 的站点

## 适合你的运行方式

你的电脑负责：

- 定时采集各个平台内容
- 生成标准化数据文件
- 生成静态页面和订阅文件
- 推送到 GitHub 仓库

GitHub Pages 负责：

- 托管静态页面
- 对外提供 RSS / JSON 地址

手机负责：

- 浏览器直接打开聚合页
- 或使用任意 RSS 阅读器订阅 feed

## 当前仓库结构

```text
.github/workflows/
  deploy-pages.yml     # 推送后自动发布 GitHub Pages

collector/
  README.md            # 采集层规划说明

site/
  index.html           # GitHub Pages 首页
  styles.css           # 页面样式
  app.js               # 前端渲染逻辑
  data/
    feeds.json         # 聚合后的标准化内容清单
    meta.json          # 站点元信息
  feeds/
    all.xml            # 全量 RSS 输出

scripts/
  build-feeds.mjs      # 抓取上游并生成站点数据
  publish-feeds.mjs    # 生成后自动 commit / push
  install-launchd.sh   # 安装本机定时任务

ops/
  com.jyufu.rss.update.plist  # launchd 模板

docker-compose.rsshub.yml
  # 本机 RSSHub 服务

rsshub/
  Dockerfile           # 带原生 Chromium 的 RSSHub 镜像
```

## 数据流

```text
本机采集器
  -> 输出标准化 JSON / RSS
  -> 写入 site/data/
  -> git push
  -> GitHub Actions 发布 Pages
  -> 手机访问 Pages
```

## 先做什么

建议按这个顺序推进：

1. 先把这个仓库推到 GitHub，并启用 GitHub Pages
2. 确认手机可以打开站点首页
3. 再接入微博采集
4. 最后接入公众号采集

这样能先验证“发布链路”是通的，再处理最难的“采集链路”。

## 采集层建议

建议不要把微博和公众号写成一个通用抓取器，而是拆成两个来源适配器：

- 微博：优先接 RSSHub 输出
- 微信公众号：优先接 WeWe RSS 或 WeRSS 输出

然后再统一转换成你自己的 `feeds.json` 格式。

## 你的最小可用方案

当你只有一台持续联网电脑时，最稳的是：

- 本机定时任务负责抓取和生成文件
- GitHub Pages 只做公开发布
- 手机只消费发布后的结果

这避免了在手机端直连家里电脑，也避免了让 GitHub Pages 承担它做不了的抓取工作。

## 已接入的第一个真实来源

当前已经预留并实现了 `tombkeeper` 的微博来源，配置见 `collector/sources.json`。

默认上游是：

- `https://rsshub.app/weibo/user/1401527553`

但公开实例常会遇到 `403` 或 `503`。因此脚本支持通过环境变量覆盖：

- `WEIBO_TOMBKEEPER_FEED_URL`

如果你后续自建 RSSHub，直接把这个变量改成自己的实例地址即可。

## 本机执行方式

先手动生成一次：

```bash
npm run build:feeds
```

如果只是验证生成链路，不走外网：

```bash
npm run build:feeds -- --fixture
```

生成并自动提交、推送：

```bash
npm run publish:feeds
```

说明：

- 如果没有远程仓库，脚本会只在本地提交，不会报错退出
- 如果上游抓取失败，脚本会保留旧条目，不会把站点清空

建议同时设置站点地址，避免 RSS 中出现占位链接：

```bash
export SITE_URL="https://<你的GitHub用户名>.github.io/<你的仓库名>"
```

如果你在本机自建 RSSHub，建议一并设置：

```bash
export WEIBO_TOMBKEEPER_FEED_URL="http://127.0.0.1:1200/weibo/user/1401527553"
```

仓库里已附带一个最小化的 Docker Compose 文件：

```bash
docker compose -f docker-compose.rsshub.yml up -d
```

说明：

- 这里不是直接用官方镜像，而是通过 `rsshub/Dockerfile` 构建一个带 Debian `chromium` 的本地镜像
- 这样微博路由在 arm64 环境下也能正常用 Puppeteer 获取访客 Cookie

## 本机定时任务

仓库里已经带了 macOS `launchd` 模板：

- `ops/com.jyufu.rss.update.plist`

安装脚本：

```bash
./scripts/install-launchd.sh
```

默认每 30 分钟执行一次：

- 生成最新 `site/data/feeds.json`
- 生成 `site/feeds/*.xml`
- 自动 `git commit`
- 若已配置远程则自动 `git push`

在真正启用前，你至少需要先完成：

1. 给仓库配置 GitHub 远程
2. 确保本机 `git` 已配置用户名和邮箱
3. 确保 `git push` 已具备认证能力
