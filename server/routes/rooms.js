const express = require('express');
const { stmts } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 所有房间接口都需要登录
router.use(authMiddleware);

// GET /api/rooms — 获取公开房间列表 + 自己创建的私密房间
router.get('/', (req, res) => {
  const publicRooms = stmts.findPublicRooms();
  const privateRooms = stmts.findRoomByCreator(req.user.id);

  // 合并并去重（私密房间仅创建者可见）
  const roomMap = new Map();
  for (const r of publicRooms) roomMap.set(r.id, r);
  for (const r of privateRooms) roomMap.set(r.id, r);

  res.json({ rooms: Array.from(roomMap.values()) });
});

// POST /api/rooms — 创建房间
router.post('/', (req, res) => {
  const { name, is_private } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: '房间名称不能为空' });
  }
  if (name.trim().length > 30) {
    return res.status(400).json({ error: '房间名称不能超过 30 个字符' });
  }

  const result = stmts.insertRoom(name.trim(), is_private ? 1 : 0, req.user.id);
  if (!result.lastInsertRowid) {
    return res.status(500).json({ error: '创建房间失败，请重试' });
  }
  const room = stmts.findRoomById(result.lastInsertRowid);
  if (!room) {
    return res.status(500).json({ error: '创建房间失败，请重试' });
  }

  // 创建者自动加入房间
  stmts.insertRoomMember(room.id, req.user.id, 'resting');

  res.status(201).json({ room });
});

// GET /api/rooms/:id — 获取房间详情
router.get('/:id', (req, res) => {
  const room = stmts.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  // 私密房间仅创建者可以查看
  if (room.is_private && room.creator_id !== req.user.id) {
    return res.status(403).json({ error: '无权访问该房间' });
  }

  const members = stmts.findRoomMembers(room.id);
  const messages = stmts.findRecentMessages(room.id).reverse();
  const leaderboard = stmts.getRoomFocusLeaderboard(room.id);

  res.json({ room, members, messages, leaderboard });
});

// POST /api/rooms/:id/join — 加入房间
router.post('/:id/join', (req, res) => {
  const room = stmts.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  // 私密房间仅创建者可以加入
  if (room.is_private && room.creator_id !== req.user.id) {
    return res.status(403).json({ error: '私密房间无法加入' });
  }

  // 检查是否已满员（上限 8 人）
  const { count } = stmts.countRoomMembers(room.id);
  if (count >= 8) {
    return res.status(400).json({ error: '房间已满（上限 8 人）' });
  }

  // 检查是否已在房间
  const existing = stmts.findRoomMember(room.id, req.user.id);
  if (existing) {
    return res.json({ room, alreadyJoined: true });
  }

  stmts.insertRoomMember(room.id, req.user.id, 'resting');
  res.json({ room, joined: true });
});

// POST /api/rooms/:id/leave — 离开房间
router.post('/:id/leave', (req, res) => {
  const member = stmts.findRoomMember(req.params.id, req.user.id);
  if (!member) {
    return res.status(400).json({ error: '你不在该房间中' });
  }

  const roomId = parseInt(req.params.id);
  const userId = req.user.id;

  // 如果是房主离开，转让给最早加入的第二位成员
  const room = stmts.findRoomById(roomId);
  if (room && room.creator_id === userId) {
    const nextMember = stmts.findEarliestMemberExcept(roomId, userId);
    if (nextMember) {
      stmts.updateRoomCreator(roomId, nextMember.user_id);
    }
  }

  stmts.deleteRoomMember(roomId, userId);

  // 如果房间为空，删除房间
  const { count } = stmts.countRoomMembers(roomId);
  if (count === 0) {
    stmts.deleteRoom(roomId);
  }

  res.json({ success: true });
});

// DELETE /api/rooms/:id — 删除房间（仅创建者可删除）
router.delete('/:id', (req, res) => {
  const room = stmts.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  if (room.creator_id !== req.user.id) {
    return res.status(403).json({ error: '只有房间创建者可以删除房间' });
  }

  stmts.deleteRoom(req.params.id);
  res.json({ success: true });
});

module.exports = router;
