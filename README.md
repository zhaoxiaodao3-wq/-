# 销售收支记录后台 · 后端服务2

为「销售收支记录后台」前端配套的轻量后端，数据模型与前端 localStorage 结构 **完全一致**，可无缝对接。

## 技术栈

- **Node.js + Express**（与前端同生态）
- **JSON 文件持久化**（`data/db.json`，零原生依赖，单人本地使用足够；后续换 SQLite 仅需替换 `src/db.js`）
- **JWT** 鉴权（默认 `admin / admin`）
- **multer** 图片上传

## 快速开始

```bash
cd server
npm install
cp .env.example .env   # 按需修改端口 / 账号 / JWT 密钥
npm start              # 默认 http://localhost:4000
```

开发热重载：`npm run dev`

## 数据模型

| 集合 | 字段 |
|------|------|
| `orders` 订单 | id, date, type, title, customerName, channel, qty, price, totalAmount, isManualTotal, payMethod, remark, imageKey |
| `expenses` 支出 | id, date, belongType(`订单支出`/`月度支出`), title, amount, source, orderId?, month? |
| `payables` 应付款 | id, date, belongType, supplier, subItems[{name,amount}], totalAmount, paidAmount, settlements[{time,amount,mode,items,remark}], remark, orderId?/month? |
| `options` 选项 | payMethods[], channels[], orderTitleHistory[], expenseTitleHistory[] |

> 业务规则（自动算总额、已结清累加、状态判定、利润/未结统计）与前端 `src/utils/calc.js`、`stats.js` **规则一致**，避免前后端不一致。

## API 一览（前缀 `/api`）

所有业务接口需带 `Authorization: Bearer <token>`。

### 鉴权
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/login` | `{username,password}` → `{token,username}` |
| GET  | `/auth/me` | 当前用户 |

### 订单
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/orders` | 列表，支持 `type/channel/customerName/keyword/startDate/endDate` 筛选，按日期倒序 |
| GET  | `/orders/:id` | 详情 |
| POST | `/orders` | 新建（关闭手动总额时自动算 `qty*price`） |
| PUT  | `/orders/:id` | 更新 |
| DELETE | `/orders/:id` | 级联删除关联「订单支出」与「订单应付款」 |

### 支出
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | `/expenses` `/expenses/:id` | 同订单，支持 `belongType/orderId/keyword/startDate/endDate` 筛选 |

### 应付款
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | `/payables` `/payables/:id` | 支持 `status/belongType/keyword` 筛选 |
| POST | `/payables/:id/settle` | 新增结清流水，自动累加 `paidAmount` 并刷新状态（超剩余部分自动截断） |

### 选项 / 历史
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/options` | 全部选项 |
| POST | `/options/custom` | `{field,value}` 追加自定义项（去重） |
| POST | `/options/order-title-history` | `{title}` 记订单标题历史（最近10） |
| POST | `/options/expense-title-history` | `{title}` 记支出标题历史（最近20） |

### 图片
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/images` | `multipart/form-data` 字段 `file`，返回 `{key,url}` |
| GET  | `/images/:key` | 读取图片 |
| DELETE | `/images/:key` | 删除 |

### 统计 / 备份
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/stats?dim=day\|month\|year&startDate=&endDate=&type=&channel=` | 返回 `{summary, rows}`，规则与前端统计页一致 |
| GET  | `/backup/export` | 导出全量 JSON 备份 |
| POST | `/backup/import` | 导入备份（覆盖） |

## 与前端对接

见 [integration/README.md](./integration/README.md) 与示例文件 `apiClient.js`、`orderService.server.js`：把前端各 service 从「localStorage 同步读写」改为「async + 调 API」即可，`db.js` 预留的「替换 SQLite/Supabase」接口正是为此设计。

## 说明

- 单用户、本地部署场景，未做多用户/权限分级。
- `data/db.json` 与 `uploads/` 已被 `.gitignore` 忽略，请自行备份。
- 生产部署请务必修改 `.env` 中的 `JWT_SECRET` 与 `ADMIN_PASS`。
