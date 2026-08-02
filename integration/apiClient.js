// 前端对接后端的 HTTP 客户端（复制到前端 src/services/apiClient.js 使用）
// 用法：import api from './apiClient'
//   api.get('/orders') / api.post('/orders', data) / api.del('/orders/:id') ...

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

function getToken() {
  try {
    return JSON.parse(localStorage.getItem('sl_auth') || '{}').token || '';
  } catch {
    return '';
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // 登录失效，清除本地态并跳回登录页
    localStorage.removeItem('sl_auth');
    if (location.pathname !== '/login') location.href = '/login';
    throw new Error('登录已过期，请重新登录');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || `请求失败(${res.status})`);
  return data;
}

export default {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p, b) => request('DELETE', p, b),
  login: (username, password) =>
    request('POST', '/auth/login', { username, password }),
};
