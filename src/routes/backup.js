// 全量备份导出 / 导入（覆盖式）
import { Router } from 'express';
import { getAll, setAll, getOptions, setOptions } from '../db.js';

const router = Router();

router.get('/export', (req, res) => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    options: getOptions(),
    orders: getAll('orders'),
    expenses: getAll('expenses'),
    payables: getAll('payables'),
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="sales-ledger-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

router.post('/import', (req, res) => {
  const data = req.body || {};
  if (!data.version || !Array.isArray(data.orders)) {
    return res.status(400).json({ error: '备份文件格式不正确' });
  }
  try {
    if (data.options) setOptions(data.options);
    setAll('orders', data.orders || []);
    setAll('expenses', data.expenses || []);
    setAll('payables', data.payables || []);
    res.json({
      ok: true,
      orders: data.orders.length,
      expenses: (data.expenses || []).length,
      payables: (data.payables || []).length,
    });
  } catch (e) {
    res.status(500).json({ error: '导入失败：' + e.message });
  }
});

export { router as backupRouter };
