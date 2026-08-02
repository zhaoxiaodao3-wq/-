// JWT 鉴权中间件
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'sales-ledger-dev-secret';
const EXPIRES = '30d';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

// 路由守卫：校验后把用户信息挂到 req.user
export function authGuard(req, res, next) {
  const token = extractToken(req);
  const decoded = token && verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  req.user = decoded;
  next();
}

// 可选鉴权：用于本地开发方便，但生产环境建议全部走 authGuard
export function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  req.user = token ? verifyToken(token) : null;
  next();
}
