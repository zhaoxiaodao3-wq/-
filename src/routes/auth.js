// 登录 / 当前用户
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../middleware/auth.js';
import { getOptions } from '../db.js';

const router = Router();

// 默认管理员账号（单人使用）。生产环境请通过环境变量覆盖。
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
// 启动时对默认密码做一次哈希缓存（简单实现，便于比较）
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASS, 8);

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER) {
    return res.status(401).json({ error: '账号或密码错误（默认 admin / admin）' });
  }
  // 支持环境变量自定义密码（已哈希）或默认哈希
  const ok = process.env.ADMIN_PASS
    ? bcrypt.compareSync(password || '', ADMIN_HASH)
    : password === 'admin';
  if (!ok) {
    return res.status(401).json({ error: '账号或密码错误（默认 admin / admin）' });
  }
  const token = signToken({ username, role: 'admin' });
  res.json({ token, username });
});

router.get('/me', (req, res) => {
  // 由 authGuard 保护
  res.json({ username: req.user.username, role: req.user.role });
});

export { router as authRouter, ADMIN_USER };
