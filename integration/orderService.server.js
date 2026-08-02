// 后端版 orderService 示例（展示改造模式，复制到前端覆盖 src/services/orderService.js）
// 关键变化：所有方法改为 async，内部调用 api，不再直接操作 localStorage。
// 其余 service（expense/payable/option/image）按同样模式改写即可。

import api from './apiClient';

export async function getOrders(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/orders${qs ? `?${qs}` : ''}`);
}

export async function getOrder(id) {
  return api.get(`/orders/${id}`);
}

export async function upsertOrder(order) {
  if (order.id) return api.put(`/orders/${order.id}`, order);
  return api.post('/orders', order);
}

export async function deleteOrder(id) {
  return api.del(`/orders/${id}`);
}

// 关联选择器仍走后端
export async function orderOptions() {
  const list = await getOrders();
  return list.map((o) => ({
    id: o.id,
    label: `${o.date} ${o.title}${o.customerName ? `（${o.customerName}）` : ''}`,
  }));
}
