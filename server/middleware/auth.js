const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'virtual-study-room-secret-key-2024';
const JWT_EXPIRES_IN = '30d';

// 生成 JWT Token（含 is_admin 字段）
function generateToken(user) {
  return jwt.sign(
    { id: user.id, nickname: user.nickname, is_admin: user.is_admin || 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Express 中间件：验证 JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '认证令牌无效或已过期' });
  }
}

// Express 中间件：验证管理员权限（需在 authMiddleware 之后使用）
function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// Socket.io 中间件：验证 JWT
function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('未提供认证令牌'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error('认证令牌无效或已过期'));
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authMiddleware,
  adminMiddleware,
  socketAuthMiddleware,
};
