// 统计聚合接口（与前端统计页一致规则）
import { Router } from 'express';
import { getAll } from '../db.js';
import { aggregateStats, DIM_DAY, DIM_MONTH, DIM_YEAR } from '../utils/stats.js';

const router = Router();

router.get('/', (req, res) => {
  const { dim = DIM_MONTH, startDate, endDate, type, channel } = req.query;
  if (![DIM_DAY, DIM_MONTH, DIM_YEAR].includes(dim)) {
    return res.status(400).json({ error: 'dim 仅支持 day / month / year' });
  }
  let orders = getAll('orders');
  const expenses = getAll('expenses');
  const payables = getAll('payables');

  if (type) orders = orders.filter((o) => o.type === type);
  if (channel) orders = orders.filter((o) => o.channel === channel);
  if (startDate) orders = orders.filter((o) => o.date && o.date >= startDate);
  if (endDate) orders = orders.filter((o) => o.date && o.date <= endDate);

  // 统计需要的支出也按同样的日期范围过滤（月度支出按归属日期）
  const filteredExpenses = expenses.filter((e) => {
    if (startDate && e.date && e.date < startDate) return false;
    if (endDate && e.date && e.date > endDate) return false;
    return true;
  });

  res.json(aggregateStats(orders, filteredExpenses, payables, dim));
});

export { router as statsRouter };
