// 订单 CRUD + 级联删除
import { Router } from 'express';
import { getAll, getById, insert, update, remove, removeWhere, uid, now } from '../db.js';
import { round2, num } from '../utils/calc.js';

const router = Router();
const COLL = 'orders';

// 规范化单个销售子项：数量×单价 => 单项金额
function normalizeItem(it = {}) {
  const qty = num(it.qty);
  const price = round2(num(it.price));
  return {
    product: (it.product || '').trim(),
    qty,
    price,
    amount: round2(qty * price),
  };
}


function serialize(o) {
  return o;
}

// 列表（支持筛选）
router.get('/', (req, res) => {
  const { type, channel, customerName, keyword, startDate, endDate } = req.query;
  let list = getAll(COLL);
  if (type) list = list.filter((o) => o.type === type);
  if (channel) list = list.filter((o) => o.channel === channel);
  if (customerName) list = list.filter((o) => (o.customerName || '').includes(customerName));
  if (keyword) {
    list = list.filter(
      (o) =>
        (o.title || '').includes(keyword) ||
        (o.customerName || '').includes(keyword)
    );
  }
  if (startDate) list = list.filter((o) => o.date && o.date >= startDate);
  if (endDate) list = list.filter((o) => o.date && o.date <= endDate);
  // 按日期倒序
  list = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  res.json(list);
});

router.get('/:id', (req, res) => {
  const item = getById(COLL, req.params.id);
  if (!item) return res.status(404).json({ error: '订单不存在' });
  res.json(item);
});

router.post('/', (req, res) => {
  const v = req.body || {};
  const ts = now();
  const items = Array.isArray(v.items) ? v.items.map(normalizeItem) : [];
  const totalAmount = v.isManualTotal
    ? round2(num(v.totalAmount))
    : round2(items.reduce((s, it) => s + it.amount, 0));
  const item = {
    id: uid('ord'),
    date: v.date,
    type: v.type,
    title: (v.title || '').trim(),
    customerName: (v.customerName || '').trim(),
    channel: v.channel,
    qty: num(v.qty),
    price: round2(num(v.price)),
    items,
    totalAmount,
    isManualTotal: !!v.isManualTotal,
    customerPaid: round2(num(v.customerPaid)),
    payMethod: v.payMethod,
    remark: v.remark || '',
    imageKey: v.imageKey || null,
    createdAt: ts,
    updatedAt: ts,
  };
  insert(COLL, item);
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const existing = getById(COLL, req.params.id);
  if (!existing) return res.status(404).json({ error: '订单不存在' });
  const v = req.body || {};
  const patch = {};
  ['date', 'type', 'title', 'customerName', 'channel', 'qty', 'price', 'payMethod', 'remark', 'imageKey', 'isManualTotal', 'customerPaid'].forEach((k) => {
    if (k in v) patch[k] = v[k];
  });
  if ('customerPaid' in patch) patch.customerPaid = round2(num(patch.customerPaid));
  if ('title' in patch) patch.title = (patch.title || '').trim();
  if ('customerName' in patch) patch.customerName = (patch.customerName || '').trim();
  if (patch.qty !== undefined) patch.qty = num(patch.qty);
  if (patch.price !== undefined) patch.price = round2(num(patch.price));
  if ('isManualTotal' in patch) patch.isManualTotal = !!patch.isManualTotal;
  // 子项（若有则按子项汇总，否则退回 数量×单价）
  if (Array.isArray(v.items)) {
    patch.items = v.items.map(normalizeItem);
    patch.totalAmount = round2(patch.items.reduce((s, it) => s + it.amount, 0));
  } else if ('totalAmount' in v && patch.isManualTotal) {
    patch.totalAmount = round2(num(v.totalAmount));
  } else if (patch.qty !== undefined || patch.price !== undefined) {
    const qty = patch.qty ?? existing.qty;
    const price = patch.price ?? existing.price;
    patch.totalAmount = round2(num(qty) * num(price));
  }
  if ('imageKey' in v) patch.imageKey = v.imageKey || null;
  const updated = update(COLL, req.params.id, patch);
  res.json(updated);
});

// 级联删除：订单 + 其关联支出（orders/expense 的 orderId） + 关联应付款 + 图片
router.delete('/:id', (req, res) => {
  const existing = getById(COLL, req.params.id);
  if (!existing) return res.status(404).json({ error: '订单不存在' });
  const removedOrders = remove(COLL, req.params.id);
  const removedExpenses = removeWhere('expenses', (e) => e.belongType === '订单支出' && e.orderId === req.params.id);
  const removedPayables = removeWhere('payables', (p) => p.belongType === '订单支出' && p.orderId === req.params.id);
  res.json({ order: removedOrders, expenses: removedExpenses, payables: removedPayables });
});

export { router as orderRouter };
