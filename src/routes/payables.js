// 应付款 CRUD + 结清流水
import { Router } from 'express';
import { getAll, getById, insert, update, remove, uid, now } from '../db.js';
import { round2, num, payableStatusOf } from '../utils/calc.js';

const router = Router();
const COLL = 'payables';

// 规范化单个应付子项：保留全部供应商信息 + 汇总各类型应付款 => 单项金额
function normalizeSubItem(it = {}) {
  const goods = round2(num(it.goodsExpense));
  const material = round2(num(it.materialExpense));
  const labor = round2(num(it.laborExpense));
  const logistics = round2(num(it.logisticsExpense));
  const other = round2(num(it.otherExpense));
  const amount = round2(goods + material + labor + logistics + other);
  return {
    id: it.id || `si_${Math.random().toString(36).slice(2, 8)}`,
    name: (it.product || it.name || '').trim(),
    product: (it.product || '').trim(),
    productQty: round2(num(it.productQty ?? it.qty)),
    productPrice: round2(num(it.productPrice ?? it.price)),
    supplier: (it.supplier || '').trim(),
    goodsExpense: goods,
    materialSupplier: (it.materialSupplier || '').trim(),
    materialExpense: material,
    worker: (it.worker || '').trim(),
    laborExpense: labor,
    logisticsProvider: (it.logisticsProvider || '').trim(),
    logisticsExpense: logistics,
    otherPayment: (it.otherPayment || '').trim(),
    otherExpense: other,
    amount,
  };
}

function normalize(v) {
  const ts = now();
  const subItems = (v.subItems || []).map(normalizeSubItem);
  const totalAmount = v.isManualTotal
    ? round2(num(v.totalAmount))
    : round2(subItems.reduce((s, it) => s + it.amount, 0));
  return {
    id: uid('pay'),
    date: v.date,
    belongType: v.belongType,
    supplier: (v.supplier || (subItems[0] && subItems[0].supplier) || '').trim(),
    subItems,
    totalAmount,
    isManualTotal: !!v.isManualTotal,
    paidAmount: 0,
    settlements: [],
    remark: v.remark || '',
    orderId: v.belongType === '订单支出' ? v.orderId : undefined,
    month: v.belongType === '月度支出' ? v.month : undefined,
    orderExpense: v.orderExpense || null,
    createdAt: ts,
    updatedAt: ts,
  };
}

router.get('/', (req, res) => {
  const { status, belongType, keyword, startDate, endDate } = req.query;
  let list = getAll(COLL);
  if (belongType) list = list.filter((p) => p.belongType === belongType);
  if (status) list = list.filter((p) => payableStatusOf(p) === status);
  if (keyword) list = list.filter((p) => (p.supplier || '').includes(keyword));
  if (startDate) list = list.filter((p) => p.date && p.date >= startDate);
  if (endDate) list = list.filter((p) => p.date && p.date <= endDate);
  list = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  res.json(list);
});

router.get('/:id', (req, res) => {
  const item = getById(COLL, req.params.id);
  if (!item) return res.status(404).json({ error: '应付款不存在' });
  res.json(item);
});

router.post('/', (req, res) => {
  const item = normalize(req.body || {});
  insert(COLL, item);
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const existing = getById(COLL, req.params.id);
  if (!existing) return res.status(404).json({ error: '应付款不存在' });
  const v = req.body || {};
  const patch = {};
  ['date', 'belongType', 'supplier', 'remark', 'isManualTotal', 'subItems', 'orderExpense'].forEach((k) => { if (k in v) patch[k] = v[k]; });
  if ('supplier' in patch) patch.supplier = (patch.supplier || '').trim();
  if ('subItems' in patch) {
    patch.subItems = (v.subItems || []).map(normalizeSubItem);
  }
  if ('isManualTotal' in patch) patch.isManualTotal = !!patch.isManualTotal;
  // 总额：手动则取传入，否则按子事项汇总
  if ('totalAmount' in v && patch.isManualTotal) patch.totalAmount = round2(num(v.totalAmount));
  else if ('subItems' in patch) patch.totalAmount = round2((patch.subItems || []).reduce((s, it) => s + it.amount, 0));
  // 归属
  if ('orderId' in v) patch.orderId = v.belongType === '订单支出' ? v.orderId : undefined;
  if ('month' in v) patch.month = v.belongType === '月度支出' ? v.month : undefined;
  const updated = update(COLL, req.params.id, patch);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const n = remove(COLL, req.params.id);
  if (!n) return res.status(404).json({ error: '应付款不存在' });
  res.json({ ok: true });
});

// 结清：新增一条结清流水，自动累加已结清金额并刷新状态
router.post('/:id/settle', (req, res) => {
  const existing = getById(COLL, req.params.id);
  if (!existing) return res.status(404).json({ error: '应付款不存在' });
  const v = req.body || {};
  const remaining = round2(num(existing.totalAmount) - num(existing.paidAmount));
  const amount = round2(Math.min(Math.max(0, num(v.amount) || 0), remaining));
  const record = {
    id: uid('set'),
    time: v.time || new Date().toISOString(),
    amount,
    mode: v.mode || '',
    items: v.items || [],
    remark: v.remark || '',
  };
  const updated = update(COLL, req.params.id, {
    paidAmount: round2(num(existing.paidAmount) + amount),
    settlements: [...(existing.settlements || []), record],
  });
  res.json(updated);
});

export { router as payableRouter };
