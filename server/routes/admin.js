const express = require('express');
const { stmts } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 所有管理接口需要登录 + 管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/rooms — 列出所有房间（含私密、含成员详情）
router.get('/rooms', async (req, res) => {
  const rooms = await stmts.findAllRooms();
  res.json({ rooms });
});

// DELETE /api/admin/rooms/:id — 强制关闭任意房间
router.delete('/rooms/:id', async (req, res) => {
  const room = await stmts.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  await stmts.deleteRoom(req.params.id);
  res.json({ success: true, message: `房间「${room.name}」已被管理员关闭` });
});

// GET /api/admin/users — 列出所有用户
router.get('/users', async (req, res) => {
  const users = await stmts.findAllUsers();
  res.json({ users });
});

module.exports = router;
