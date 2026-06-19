# 棋局复盘训练台

给孩子用的国际象棋复盘和错题训练软件。可以上传/粘贴 PGN，也可以绑定公开账号同步棋局；系统用浏览器里的 Stockfish 找出疑问手、错着和大漏着，生成可随机刷的题库。

## 如何打开

需要 Node.js `22.13.0` 或更新版本。

```bash
npm install
npm run dev
```

看到本地地址后打开：

```text
http://localhost:3000/
```

如果 `localhost` 打不开，可以试：

```text
http://[::1]:3000/
```

本项目使用 vinext + Sites/Miniflare，本地 D1 数据库由开发服务器模拟。

## 主要页面

- `/`：刷题和手动复盘上传
- `/settings`：绑定 Chess.com、Lichess、FIDE ID，检查更新和导入棋局
- `/library`：题库管理、筛选、批量删除

## 手动上传 PGN

1. 进入首页「复盘上传」。
2. 选择上传文件或粘贴 PGN。
3. 选择棋局、分析颜色、深度、范围。
4. 可选填写时间类型和棋局日期；不填日期时使用 PGN 日期，再没有则使用上传日期。
5. 点击「开始分析」。
6. 勾选候选题并加入题集。

## 账号同步

在「用户设置」里可以绑定：

- Chess.com 用户名
- Lichess 用户名
- FIDE ID

Chess.com 和 Lichess 支持：

- 验证账号
- 检查更新
- 导入公开棋局
- 按用户实际执色生成题目
- 解绑账号，并选择保留或删除对应棋局和题库

FIDE 支持 ID 验证和绑定。FIDE 官方没有稳定公开的“按 FIDE ID 下载 PGN 棋局”接口，所以 FIDE 棋局建议从 TWIC、赛事官网或数据库导出 PGN 后走「复盘上传」导入。

## 刷题

刷题页可以按范围抽题：

- 全部时间
- 最近一年
- 最近半年
- 最近三个月
- 最近 30 天
- 时间类型：bullet、blitz、rapid、classical、correspondence
- 来源：PGN、Chess.com、Lichess、FIDE

答题后可以打开「回顾棋局」，使用分析棋盘、评估条、候选走法、棋谱跳转、方向键和反转棋盘。

## 题库管理

题库页支持：

- 按来源过滤
- 按时间类型过滤
- 按棋局日期范围过滤
- 查看来源账号、上传日期、棋局日期、练习记录
- 单题删除
- 批量删除

## 数据说明

主要数据表：

- `games`：完整棋局记录
- `puzzles`：题库记录
- `user_settings`：绑定账号
- `practice_events`：每日练习统计

题目会记录来源平台、来源账号、棋局日期、时间类型、用户执色和原始 PGN。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run db:generate
```

## 清空本地测试数据

开发环境可以调用：

```bash
curl -X DELETE http://localhost:3000/api/admin/reset
```

这会清空棋局、题库和练习记录，但不会删除账号绑定设置。
