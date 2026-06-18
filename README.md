# 棋局复盘训练台

上传女儿的国际象棋 PGN，对局会在浏览器里用 Stockfish 自动分析。系统会把疑问手、错着、大漏着整理成题目，之后可以随机刷题。

## 如何打开

需要 Node.js `22.13.0` 或更新版本。

```bash
npm install
npm run dev
```

看到下面这样的输出后，再打开浏览器：

```text
Local: http://localhost:3000/
```

如果 `localhost` 打不开，请用这个地址：

```text
http://[::1]:3000/
```

注意：在这套 vinext/Miniflare 本地环境里，服务可能只监听 IPv6 loopback，所以 `http://127.0.0.1:3000/` 可能打不开，这是正常的。优先使用 `http://localhost:3000/`。

这个项目的 `npm run dev` 已经做了 Windows 兼容处理，会把 Wrangler/Miniflare 的本地配置和日志写到项目目录里的 `.wrangler-config` 与 `.wrangler-logs`，避免因为用户目录权限导致服务启动失败。

## 怎么用

1. 点击「上传 PGN」，选择 `.pgn` 文件。
2. 选择要分析的棋局、颜色、深度和范围。
3. 点击「开始分析」。
4. 在「候选题」里勾选要保留的错误局面。
5. 点击「加入题集」。
6. 在右侧棋盘点击起点和终点来答题。
7. 点击「随机一题」继续刷题。

## 分析说明

- Stockfish 使用 `stockfish-18-lite-single`，在浏览器端运行。
- 题库数据保存到 D1 绑定 `DB`。
- 本地开发时，Sites/Vite 会模拟这个 D1 绑定。
- 棋局文件不会上传到第三方服务；PGN 在浏览器里解析，题目元数据通过本地接口保存。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run db:generate
```

## 目录

- `app/page.tsx`: 上传、分析、刷题界面
- `app/api/puzzles`: 题库 API
- `db/schema.ts`: 题库数据表
- `public/stockfish-18-lite-single.*`: 浏览器端 Stockfish 引擎
- `.openai/hosting.json`: Sites 存储绑定
