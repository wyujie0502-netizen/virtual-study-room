const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'virtual-study-room-secret-key-2024';
const JWT_EXPIRES_IN = '7d';

// 生成 JWT Token
function generateToken(user) {
  return jwt.sign({ id: user.id, nickname: user.nickname }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
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

module.exports = { JWT_SECRET, generateToken, authMiddleware, socketAuthMiddleware };
