// 业务计算：与前端 src/utils/calc.js / stats.js 保持一致的规则

const PAYABLE_STATUS = { UNPAID: '未结清', PARTIAL: '部分结清', PAID: '全部结清' };

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n) {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

// 单订单关联的「订单支出」合计
export function orderExpenseAmount(orderId, expenses) {
  return round2(
    expenses
      .filter((e) => e.belongType === '订单支出' && e.orderId === orderId)
      .reduce((s, e) => s + num(e.amount), 0)
  );
}

// 单订单利润 = 销售总金额 - 该订单已支付总支出
export function orderProfit(order, expenses) {
  return round2(num(order.totalAmount) - orderExpenseAmount(order.id, expenses));
}

// 全局总支出 = 所有已支付支出（订单支出 + 月度支出）
export function globalExpenseAmount(expenses) {
  return round2(expenses.reduce((s, e) => s + num(e.amount), 0));
}

// 全局总利润
export function globalProfit(orders, expenses) {
  const sales = orders.reduce((s, o) => s + num(o.totalAmount), 0);
  return round2(sales - globalExpenseAmount(expenses));
}

// 应付款剩余未结
export function payableRemaining(p) {
  return round2(num(p.totalAmount) - num(p.paidAmount));
}

// 应付款状态
export function payableStatusOf(p) {
  const paid = num(p.paidAmount);
  const total = num(p.totalAmount);
  if (paid <= 0) return PAYABLE_STATUS.UNPAID;
  if (paid >= total) return PAYABLE_STATUS.PAID;
  return PAYABLE_STATUS.PARTIAL;
}

// 订单关联的应付款聚合状态（取最严重）
export function aggregatePayableStatusForOrder(orderId, payables) {
  const linked = payables.filter((p) => p.belongType === '订单支出' && p.orderId === orderId);
  if (linked.length === 0) return null;
  const hasUnpaid = linked.some((p) => num(p.paidAmount) <= 0);
  const hasPartial = linked.some((p) => num(p.paidAmount) > 0 && num(p.paidAmount) < num(p.totalAmount));
  if (hasUnpaid) return PAYABLE_STATUS.UNPAID;
  if (hasPartial) return PAYABLE_STATUS.PARTIAL;
  return PAYABLE_STATUS.PAID;
}

export { PAYABLE_STATUS };
