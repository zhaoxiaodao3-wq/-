// 选项 / 历史复用管理
import { Router } from 'express';
import { getOptions, setOptions } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(getOptions());
});

// 追加自定义选项（去重）
router.post('/custom', (req, res) => {
  const { field, value } = req.body || {};
  if (!field || !value) return res.status(400).json({ error: 'field 与 value 必填' });
  const options = getOptions();
  const list = options[field] || [];
  if (!list.includes(value)) options[field] = [...list, value];
  setOptions(options);
  res.json(options);
});

// 订单标题历史（保留最近 10 条，新值在前，去重）
router.post('/order-title-history', (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.json(getOptions());
  const options = getOptions();
  const next = [title, ...(options.orderTitleHistory || []).filter((t) => t !== title)].slice(0, 10);
  options.orderTitleHistory = next;
  setOptions(options);
  res.json(options);
});

// 支出标题历史（保留最近 20 条）
router.post('/expense-title-history', (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.json(getOptions());
  const options = getOptions();
  const next = [title, ...(options.expenseTitleHistory || []).filter((t) => t !== title)].slice(0, 20);
  options.expenseTitleHistory = next;
  setOptions(options);
  res.json(options);
});

export { router as optionRouter };
