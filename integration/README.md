# 前端对接后端指南

后端已启动（默认 `http://localhost:4000`），本目录提供让现有前端从「本地存储」切换到「后端」所需的最小改动。

## 改动一览

前端数据层原本用 `db.js`（localStorage 同步读写）。要接后端，需要把各 `service` 改成 **async + 调 API**。这是一项一次性改造，模式完全一致。

### 1. 复制 `apiClient.js`

把本目录的 `apiClient.js` 复制到前端 `src/services/apiClient.js`。
它从 `localStorage.sl_auth.token` 取 token，自动带 `Authorization` 头；登录失效时跳回登录页。

### 2. 改造各 service（以 orderService 为例）

把本目录的 `orderService.server.js` 覆盖前端 `src/services/orderService.js`。
核心模式：同步 `db.read/write` → 异步 `api.get/post/put/del`。

需要同样改造的文件：
- `orderService.js`（示例已给）
- `expenseService.js`
- `payableService.js`（含 `addSettlement` → `POST /payables/:id/settle`）
- `optionService.js`（`getOptions` → `GET /options`，`pushOrderTitleHistory` → `POST /options/order-title-history` …）
- `imageService.js`（`saveImage` → `POST /images` multipart，`getImageURL` → 直接返回 `/api/images/:key` 的 URL）

### 3. 登录改造

前端 `authService.login` 现在应调用 `api.login(username, password)` 并把返回的 `token` 存到 `sl_auth`：

```js
// src/services/authService.js
import api from './apiClient';
export async function login(username, password) {
  const { token, username: u } = await api.login(username, password);
  localStorage.setItem('sl_auth', JSON.stringify({ token, username: u }));
  return { ok: true };
}
export function isLoggedIn() {
  try { return !!JSON.parse(localStorage.getItem('sl_auth') || '{}').token; } catch { return false; }
}
```

> 注意：登录态字段从 `username/loginAt` 变为 `token/username`，`db.js` 里 `sl_auth` 的读取逻辑无需改（仍按需取）。

### 4. 调用方加 `await`

所有调用 service 的地方（表单 `onFinish` 里）原本是同步，需改为 `await`：
```js
// 之前
upsertOrder(order); message.success(...);
// 之后
await upsertOrder(order); message.success(...);
```
以及列表页的 `useEffect` 里 `getOrders()` 等改为 `await`（配合 `async` 函数）。

### 5. 配置后端地址

前端根目录 `.env`：
```
VITE_API_BASE=http://localhost:4000/api
```
生产环境改为你的后端域名（`/api` 可不带，因为后端已统一前缀）。

## 改造完成后

- 数据全部落在后端 `server/data/db.json`（换成 SQLite 只需替换该文件逻辑）。
- 登录账号：默认 `admin / admin`（可在 `server/.env` 覆盖）。
- 图片走 `POST /images` 存盘，前端 `getImageURL` 直接拼 `/api/images/:key`。
- 备份/恢复：前端 `exportBackup/importBackup` 可改为调用 `GET/POST /backup/export|import`。
