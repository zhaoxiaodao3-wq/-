// 数据持久化层（SQLite 存储，使用 Node 内置 node:sqlite，零原生依赖）
// 2026-08-02 由 JSON 文件存储迁移而来：
//   - 首次启动自动把 data/db.json 导入 SQLite，原文件备份为 data/db.json.migrated
//   - 对外接口与旧版完全一致（getAll/setAll/getById/insert/update/remove/...），路由层无需改动
// 设计：每个集合一张表（id + payload JSON + seq 排序），seq 越大越靠前（新插入在前）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const DB_FILE = path.join(DATA_DIR, 'db.sqlite');
const JSON_FILE = path.join(DATA_DIR, 'db.json');

export const COLLECTIONS = ['orders', 'expenses', 'payables', 'options'];
const TABLE_COLLECTIONS = ['orders', 'expenses', 'payables'];

const DEFAULT_OPTIONS = {
  payMethods: ['现金', '微信', '支付宝', '银行卡转账'],
  channels: ['微信', '抖音', '电话', '线下'],
  orderTitleHistory: [],
  expenseTitleHistory: [],
};

let db = null;

function assertTable(collection) {
  if (!TABLE_COLLECTIONS.includes(collection)) throw new Error(`unknown collection: ${collection}`);
}

function initDb() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  for (const t of TABLE_COLLECTIONS) {
    db.exec(`CREATE TABLE IF NOT EXISTS "${t}" (id TEXT PRIMARY KEY, payload TEXT NOT NULL, seq INTEGER NOT NULL)`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS "options" (key TEXT PRIMARY KEY, payload TEXT NOT NULL)`);
  migrateFromJson();
  return db;
}

// 从旧 JSON 文件一次性迁移（幂等：仅当集合表为空时执行）
function migrateFromJson() {
  if (!fs.existsSync(JSON_FILE)) return;
  let store = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
    store = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return;
  }
  const total = TABLE_COLLECTIONS.reduce((s, t) => s + db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c, 0);
  if (total > 0) return; // 已有数据，跳过迁移
  for (const t of TABLE_COLLECTIONS) {
    const list = Array.isArray(store[t]) ? store[t] : [];
    if (list.length) setAll(t, list);
  }
  if (store.options && typeof store.options === 'object') setOptions(store.options);
  try {
    fs.renameSync(JSON_FILE, JSON_FILE + '.migrated');
    console.log('[SQLite] 已从 db.json 迁移数据，原文件备份为 db.json.migrated');
  } catch {
    /* 忽略 */
  }
}

// ---- 通用集合读写（接口与旧版完全一致）----
export function getAll(collection) {
  assertTable(collection);
  const rows = db.prepare(`SELECT payload FROM "${collection}" ORDER BY seq DESC`).all();
  return rows.map((r) => JSON.parse(r.payload));
}

export function setAll(collection, list) {
  assertTable(collection);
  const d = db;
  d.exec('BEGIN');
  try {
    d.prepare(`DELETE FROM "${collection}"`).run();
    const ins = d.prepare(`INSERT INTO "${collection}" (id, payload, seq) VALUES (?, ?, ?)`);
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const item = list[i];
      if (!item || typeof item !== 'object') continue;
      ins.run(String(item.id ?? uid(collection)), JSON.stringify(item), n - i);
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return list;
}

export function getById(collection, id) {
  assertTable(collection);
  const row = db.prepare(`SELECT payload FROM "${collection}" WHERE id = ?`).get(String(id));
  return row ? JSON.parse(row.payload) : null;
}

export function insert(collection, item) {
  assertTable(collection);
  const seq = db.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM "${collection}"`).get().s;
  const id = String(item.id ?? uid(collection));
  db.prepare(`INSERT INTO "${collection}" (id, payload, seq) VALUES (?, ?, ?)`).run(id, JSON.stringify(item), seq);
  return item;
}

export function update(collection, id, patch) {
  assertTable(collection);
  const row = db.prepare(`SELECT payload FROM "${collection}" WHERE id = ?`).get(String(id));
  if (!row) return null;
  const merged = { ...JSON.parse(row.payload), ...patch, updatedAt: Date.now() };
  db.prepare(`UPDATE "${collection}" SET payload = ? WHERE id = ?`).run(JSON.stringify(merged), String(id));
  return merged;
}

export function remove(collection, id) {
  assertTable(collection);
  return db.prepare(`DELETE FROM "${collection}" WHERE id = ?`).run(String(id)).changes;
}

export function removeWhere(collection, predicate) {
  const list = getAll(collection);
  const kept = list.filter((x) => !predicate(x));
  setAll(collection, kept);
  return list.length - kept.length;
}

// ---- 选项 ----
export function getOptions() {
  const row = db.prepare(`SELECT payload FROM "options" WHERE key = 'default'`).get();
  return { ...DEFAULT_OPTIONS, ...(row ? JSON.parse(row.payload) : {}) };
}

export function setOptions(options) {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  db.prepare(`INSERT OR REPLACE INTO "options" (key, payload) VALUES ('default', ?)`).run(JSON.stringify(merged));
  return merged;
}

// ---- 工具 ----
export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function now() {
  return Date.now();
}

// 模块初始化（启动即建库 + 迁移）
initDb();
