// 统计聚合（与前端 src/utils/stats.js 规则一致）
// 维度：day(YYYY-MM-DD) / month(YYYY-MM) / year(YYYY)

import { num, round2, orderExpenseAmount } from './calc.js';

export const DIM_DAY = 'day';
export const DIM_MONTH = 'month';
export const DIM_YEAR = 'year';

function dateToDimKey(dateStr, dim) {
  if (!dateStr) return '';
  if (dim === DIM_DAY) return dateStr;
  if (dim === DIM_MONTH) return dateStr.slice(0, 7);
  if (dim === DIM_YEAR) return dateStr.slice(0, 4);
  return dateStr;
}

function dimKeyLabel(key, dim) {
  if (!key) return '';
  if (dim === DIM_DAY) return key;
  if (dim === DIM_MONTH) return `${key.slice(5)}月`;
  if (dim === DIM_YEAR) return `${key}年`;
  return key;
}

export function aggregateStats(orders, expenses, payables, dim) {
  const buckets = new Map();

  const ensure = (key) => {
    if (!buckets.has(key)) buckets.set(key, { dimKey: key, qty: 0, sales: 0, orderExpense: 0, monthExpense: 0 });
    return buckets.get(key);
  };

  for (const o of orders) {
    const key = dateToDimKey(o.date, dim);
    const b = ensure(key);
    b.qty += num(o.qty);
    b.sales += num(o.totalAmount);
    b.orderExpense += orderExpenseAmount(o.id, expenses);
  }

  if (dim === DIM_MONTH || dim === DIM_YEAR) {
    for (const e of expenses) {
      if (e.belongType !== '月度支出') continue;
      const key = dateToDimKey(e.date, dim);
      const b = ensure(key);
      b.monthExpense += num(e.amount);
    }
  }

  const rows = [];
  let totalQty = 0, totalSales = 0, totalExpense = 0;
  for (const [key, b] of buckets) {
    const exp = round2(b.orderExpense + b.monthExpense);
    const profit = round2(b.sales - exp);
    rows.push({
      dimKey: key,
      dimLabel: dimKeyLabel(key, dim),
      qty: round2(b.qty),
      sales: round2(b.sales),
      expense: exp,
      profit,
    });
    totalQty += b.qty;
    totalSales += b.sales;
    totalExpense += exp;
  }
  rows.sort((a, b) => (a.dimKey < b.dimKey ? 1 : -1));

  const totalUnpaid = payables.reduce((s, p) => s + (num(p.totalAmount) - num(p.paidAmount)), 0);

  return {
    summary: {
      totalQty: round2(totalQty),
      totalSales: round2(totalSales),
      totalExpense: round2(totalExpense),
      totalProfit: round2(totalSales - totalExpense),
      totalUnpaid: round2(totalUnpaid),
    },
    rows,
  };
}
