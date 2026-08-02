// 数据持久化层（JSON 文件存储，零原生依赖）
// 设计目标：与前端 db.js 的 key 语义完全一致（orders / expenses / payables / options），
// 后续若要换成 SQLite，只需替换本文件的方法实现，路由层无需改动。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = ['orders', 'expenses', 'payables', 'options'];

const DEFAULT_OPTIONS = {
  payMethods: ['现金', '微信', '支付宝', '银行卡转账'],
  channels: ['微信', '抖音', '电话', '线下'],
  orderTitleHistory: [],
  expenseTitleHistory: [],
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const init = {
      orders: [],
      expenses: [],
      payables: [],
      options: { ...DEFAULT_OPTIONS },
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2), 'utf-8');
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return { orders: [], expenses: [], payables: [], options: { ...DEFAULT_OPTIONS } };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// ---- 通用集合读写 ----
export function getAll(collection) {
  const store = readStore();
  return store[collection] ?? [];
}

export function setAll(collection, list) {
  const store = readStore();
  store[collection] = list;
  writeStore(store);
  return list;
}

export function getById(collection, id) {
  return getAll(collection).find((x) => x.id === id) || null;
}

export function insert(collection, item) {
  const store = readStore();
  store[collection] = [item, ...(store[collection] || [])];
  writeStore(store);
  return item;
}

export function update(collection, id, patch) {
  const store = readStore();
  const list = store[collection] || [];
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
  writeStore(store);
  return list[idx];
}

export function remove(collection, id) {
  const store = readStore();
  const before = (store[collection] || []).length;
  store[collection] = (store[collection] || []).filter((x) => x.id !== id);
  writeStore(store);
  return before - (store[collection] || []).length;
}

export function removeWhere(collection, predicate) {
  const store = readStore();
  const before = (store[collection] || []).length;
  store[collection] = (store[collection] || []).filter((x) => !predicate(x));
  writeStore(store);
  return before - (store[collection] || []).length;
}

// ---- 选项 ----
export function getOptions() {
  const store = readStore();
  return { ...DEFAULT_OPTIONS, ...(store.options || {}) };
}

export function setOptions(options) {
  const store = readStore();
  store.options = { ...DEFAULT_OPTIONS, ...options };
  writeStore(store);
  return store.options;
}

// ---- 工具 ----
export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function now() {
  return Date.now();
}

export { COLLECTIONS };
