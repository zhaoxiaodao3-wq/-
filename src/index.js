// 销售收支记录后台 - 后端入口
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { authGuard } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { orderRouter } from './routes/orders.js';
import { expenseRouter } from './routes/expenses.js';
import { payableRouter } from './routes/payables.js';
import { optionRouter } from './routes/options.js';
import { imageRouter } from './routes/images.js';
import { statsRouter } from './routes/stats.js';
import { backupRouter } from './routes/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.join(__dirname, '..', 'public');
const app = express();
const PORT = process.env.PORT || 4000;

// 允许前端跨域（开发态 localhost:5173 等）
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态资源：上传的图片
app.use('/api/images', imageRouter);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// 公开：登录
app.use('/api/auth', authRouter);

// 以下接口均需登录
const api = express.Router();
api.use(authGuard);
api.use('/orders', orderRouter);
api.use('/expenses', expenseRouter);
api.use('/payables', payableRouter);
api.use('/options', optionRouter);
api.use('/stats', statsRouter);
api.use('/backup', backupRouter);
app.use('/api', api);

app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// 生产环境：同时服务前端 SPA 静态文件
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return; // API 返回 404
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`销售记账后端已启动: http://localhost:${PORT}`);
  console.log(`默认账号: admin / admin`);
});

export { app };
