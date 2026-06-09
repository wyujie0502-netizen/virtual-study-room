const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const { waitForReady } = require('./db');
const { setupSocketHandlers } = require('./socket/handlers');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const statsRoutes = require('./routes/stats');

async function start() {
  await waitForReady();

  const app = express();
  const server = http.createServer(app);

  // 检查是否生产模式（前端已构建）
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  const hasFrontend = fs.existsSync(clientDist);

  // CORS：生产模式允许所有来源（方便局域网联机），开发模式限制来源
  const corsOrigin = hasFrontend
    ? true
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  // ==================== 中间件 ====================
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json());

  // ==================== REST API 路由 ====================
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/stats', statsRoutes);
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ==================== 生产模式：提供前端静态文件 ====================
  if (hasFrontend) {
    app.use(express.static(clientDist));
    const indexHtml = path.join(clientDist, 'index.html');
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(indexHtml);
    });
  }

  // ==================== Socket.io ====================
  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 5000,
    pingTimeout: 10000,
  });

  setupSocketHandlers(io);

  // ==================== 启动 ====================
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    let lanIP = 'localhost';
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          lanIP = iface.address;
          break;
        }
      }
    }

    console.log('=======================================');
    console.log('  📚 虚拟自习室 已启动');
    console.log(`  本机访问: http://localhost:${PORT}`);
    console.log(`  局域网:   http://${lanIP}:${PORT}`);
    console.log(`  API:      http://localhost:${PORT}/api`);
    if (!hasFrontend) {
      console.log('  ⚠️  前端未构建，运行 cd client && npm run build');
    }
    console.log('=======================================');
  });

  process.on('SIGINT', () => {
    console.log('\n正在关闭...');
    io.close();
    server.close(() => process.exit(0));
  });
}

start().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
