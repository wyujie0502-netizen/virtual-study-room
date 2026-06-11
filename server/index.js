const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const hasFrontend = fs.existsSync(clientDist);

async function main() {
  // 初始化数据库（异步）
  let dbReady = true;
  try {
    const { initDB } = require('./db');
    await initDB();
    console.log('[启动] 数据库初始化成功');
  } catch (e) {
    dbReady = false;
    console.error('[启动] 数据库初始化失败:', e.message);
  }

  const { setupSocketHandlers } = require('./socket/handlers');
  const authRoutes = require('./routes/auth');
  const roomRoutes = require('./routes/rooms');
  const statsRoutes = require('./routes/stats');
  const adminRoutes = require('./routes/admin');

  const app = express();
  const server = http.createServer(app);

  // CORS
  app.use(cors({ origin: hasFrontend ? true : ['http://localhost:5173'], credentials: true }));
  app.use(express.json());

  // API 路由
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/admin', adminRoutes);
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', db: dbReady, timestamp: new Date().toISOString() });
  });

  // 前端静态文件
  if (hasFrontend) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Socket.io
  const io = new Server(server, {
    cors: { origin: hasFrontend ? true : ['http://localhost:5173'], methods: ['GET', 'POST'], credentials: true },
    pingInterval: 5000,
    pingTimeout: 10000,
  });

  setupSocketHandlers(io);

  // 启动
  server.listen(PORT, '0.0.0.0', () => {
    console.log('=======================================');
    console.log('  📚 虚拟自习室 已启动');
    console.log(`  端口: ${PORT}`);
    console.log(`  数据库: ${dbReady ? 'OK' : 'FAILED'}`);
    console.log(`  前端: ${hasFrontend ? '已就绪' : '未构建'}`);
    console.log('=======================================');
  });

  process.on('SIGINT', () => {
    console.log('正在关闭...');
    io.close();
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error('[启动] 致命错误:', err);
  process.exit(1);
});
