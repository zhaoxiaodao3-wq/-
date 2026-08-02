// 支出 CRUD
import { Router } from 'express';
import { getAll, getById, insert, update, remove, uid, now } from '../db.js';
import { round2, num } from '../utils/calc.js';

const router = Router();
const COLL = 'expenses';

router.get('/', (req, res) => {
  const { belongType, orderId, keyword, startDate, endDate } = req.query;
  let list = getAll(COLL);
  if (belongType) list = list.filter((e) => e.belongType === belongType);
  if (orderId) list = list.filter((e) => e.orderId === orderId);
  if (keyword) list = list.filter((e) => (e.title || '').includes(keyword) || (e.source || '').includes(keyword));
  if (startDate) list = list.filter((e) => e.date && e.date >= startDate);
  if (endDate) list = list.filter((e) => e.date && e.date <= endDate);
  list = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  res.json(list);
});

router.get('/:id', (req, res) => {
  const item = getById(COLL, req.params.id);
  if (!item) return res.status(404).json({ error: '支出不存在' });
  res.json(item);
});

router.post('/', (req, res) => {
  const v = req.body || {};
  const ts = now();
  const item = {
    id: uid('exp'),
    date: v.date,
    belongType: v.belongType,
    title: (v.title || '').trim(),
    amount: round2(num(v.amount)),
    source: (v.source || '').trim(),
    remark: v.remark || '',
    orderId: v.belongType === '订单支出' ? v.orderId : undefined,
    month: v.belongType === '月度支出' ? v.month : undefined,
    createdAt: ts,
    updatedAt: ts,
  };
  insert(COLL, item);
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const existing = getById(COLL, req.params.id);
  if (!existing) return res.status(404).json({ error: '支出不存在' });
  const v = req.body || {};
  const patch = {};
  ['date', 'belongType', 'title', 'source', 'remark'].forEach((k) => { if (k in v) patch[k] = v[k]; });
  if ('title' in patch) patch.title = (patch.title || '').trim();
  if ('source' in patch) patch.source = (patch.source || '').trim();
  if ('amount' in v) patch.amount = round2(num(v.amount));
  if ('orderId' in v) patch.orderId = v.belongType === '订单支出' ? v.orderId : undefined;
  if ('month' in v) patch.month = v.belongType === '月度支出' ? v.month : undefined;
  const updated = update(COLL, req.params.id, patch);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const n = remove(COLL, req.params.id);
  if (!n) return res.status(404).json({ error: '支出不存在' });
  res.json({ ok: true });
});

export { router as expenseRouter };
