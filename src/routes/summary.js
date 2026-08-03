// 聚合汇总接口：按订单 / 客户 / 供货商 汇总应付款结算进度
import { Router } from 'express';
import { getAll } from '../db.js';
import { round2, num } from '../utils/calc.js';

const router = Router();

// 一组应付款的聚合状态：有未结清→未结清；有部分结清→部分结清；否则全部结清
function aggregateStatus(list) {
  if (!list.length) return '无';
  const hasUnpaid = list.some((p) => num(p.paidAmount) <= 0);
  const hasPartial = list.some((p) => num(p.paidAmount) > 0 && num(p.paidAmount) < num(p.totalAmount));
  if (hasUnpaid) return '未结清';
  if (hasPartial) return '部分结清';
  return '全部结清';
}

// 对一组应付款做汇总
function summarize(list) {
  const totalAmount = round2(list.reduce((s, p) => s + num(p.totalAmount), 0));
  const paidAmount = round2(list.reduce((s, p) => s + num(p.paidAmount), 0));
  const unpaidAmount = round2(totalAmount - paidAmount);
  const progress = totalAmount > 0 ? round2((paidAmount / totalAmount) * 100) : 0;
  return {
    count: list.length,
    totalAmount,
    paidAmount,
    unpaidAmount,
    progress, // 百分比，0-100
    status: aggregateStatus(list),
  };
}

// GET /api/summary/payables?groupBy=order|customer|supplier
router.get('/payables', (req, res) => {
  const { groupBy = 'order' } = req.query;
  if (!['order', 'customer', 'supplier'].includes(groupBy)) {
    return res.status(400).json({ error: 'groupBy 仅支持 order / customer / supplier' });
  }

  const payables = getAll('payables');
  const orders = getAll('orders');
  const ordersById = new Map(orders.map((o) => [o.id, o]));

  let groups = [];

  if (groupBy === 'customer') {
    // 按订单归属的客户名汇总（仅「订单支出」类应付款）
    const byCustomer = new Map();
    for (const p of payables) {
      if (p.belongType !== '订单支出') continue;
      const order = ordersById.get(p.orderId);
      const key = (order && order.customerName) || '未关联客户';
      if (!byCustomer.has(key)) byCustomer.set(key, []);
      byCustomer.get(key).push(p);
    }
    groups = [...byCustomer.entries()].map(([key, list]) => ({
      key,
      label: key,
      ...summarize(list),
    }));
  } else if (groupBy === 'supplier') {
    // 按应付款供货商汇总（全部应付款）
    const bySupplier = new Map();
    for (const p of payables) {
      const key = p.supplier || '未填写供货商';
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key).push(p);
    }
    groups = [...bySupplier.entries()].map(([key, list]) => ({
      key,
      label: key,
      ...summarize(list),
    }));
  } else {
    // 默认：按订单汇总（仅「订单支出」类应付款）
    const byOrder = new Map();
    for (const p of payables) {
      if (p.belongType !== '订单支出') continue;
      const key = p.orderId;
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key).push(p);
    }
    groups = [...byOrder.entries()].map(([key, list]) => {
      const order = ordersById.get(key);
      return {
        key,
        orderId: key,
        label: (order && order.title) || '未命名订单',
        customerName: (order && order.customerName) || '',
        date: (order && order.date) || '',
        ...summarize(list),
      };
    });
  }

  // 未付金额大的排在前面，便于优先跟进
  groups.sort((a, b) => b.unpaidAmount - a.unpaidAmount);

  res.json({
    groupBy,
    total: summarize(payables),
    groups,
  });
});

export { router as summaryRouter };
