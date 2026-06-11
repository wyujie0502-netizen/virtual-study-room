const express = require('express');
const bcrypt = require('bcryptjs');
const { stmts } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 所有房间接口都需要登录
router.use(authMiddleware);

// GET /api/rooms — 获取房间列表
//   公开房间 + 有密码的私密房间（所有人可见）+ 自己创建的无密码私密房间
router.get('/', async (req, res) => {
  const publicRooms = await stmts.findPublicRooms();
  const privateRooms = await stmts.findRoomByCreator(req.user.id);

  // 合并去重
  const roomMap = new Map();
  for (const r of publicRooms) roomMap.set(r.id, r);
  for (const r of privateRooms) roomMap.set(r.id, r);

  res.json({ rooms: Array.from(roomMap.values()) });
});

// POST /api/rooms — 创建房间
router.post('/', async (req, res) => {
  const { name, is_private, password } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: '房间名称不能为空' });
  }
  if (name.trim().length > 30) {
    return res.status(400).json({ error: '房间名称不能超过 30 个字符' });
  }

  // 密码仅在私密房间时有效
  let password_hash = null;
  if (is_private && password && password.trim().length > 0) {
    if (password.trim().length < 3) {
      return res.status(400).json({ error: '房间密码至少 3 位' });
    }
    password_hash = bcrypt.hashSync(password.trim(), 10);
  }

  const result = await stmts.insertRoom(name.trim(), is_private ? 1 : 0, req.user.id, password_hash);
  if (!result.lastInsertRowid) {
    return res.status(500).json({ error: '创建房间失败，请重试' });
  }
  const room = await stmts.findRoomById(result.lastInsertRowid);
  if (!room) {
    return res.status(500).json({ error: '创建房间失败，请重试' });
  }

  // 创建者自动加入房间
  await stmts.insertRoomMember(room.id, req.user.id, 'resting');

  res.status(201).json({ room });
});

// GET /api/rooms/:id — 获取房间详情
router.get('/:id', async (req, res) => {
  const room = await stmts.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  // 无密码的私密房间仅创建者 / 管理员可以查看
  const isAdmin = req.user.is_admin === 1;
  if (room.is_private && !room.password_hash && room.creator_id !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: '无权访问该房间' });
  }

  const members = await stmts.findRoomMembers(room.id);
  const messages = (await stmts.findRecentMessages(room.id)).reverse();
  const leaderboard = await stmts.getRoomFocusLeaderboard(room.id);

  res.json({ room, members, messages, leaderboard });
});

// POST /api/rooms/:id/join — 加入房间
router.post('/:id/join', async (req, res) => {
  const room = await stmts.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const isAdmin = req.user.is_admin === 1;

  // 无密码的私密房间仅创建者可以加入
  if (room.is_private && !room.password_hash && room.creator_id !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: '私密房间无法加入' });
  }

  // 有密码的私密房间：需要验证密码（管理员可跳过）
  if (room.is_private && room.password_hash && !isAdmin) {
    const { password } = req.body;
    if (!password || !bcrypt.compareSync(password, room.password_hash)) {
      return res.status(403).json({ error: '房间密码错误' });
    }
  }

  // 检查是否已满员（上限 8 人）
  const { count } = await stmts.countRoomMembers(room.id);
  if (count >= 8) {
    return res.status(400).json({ error: '房间已满（上限 8 人）' });
  }

  // 检查是否已在房间
  const existing = await stmts.findRoomMember(room.id, req.user.id);
  if (existing) {
    return res.json({ room, alreadyJoined: true });
  }

  await stmts.insertRoomMember(room.id, req.user.id, 'resting');
  res.json({ room, joined: true });
});

// POST /api/rooms/:id/leave — 离开房间
router.post('/:id/leave', async (req, res) => {
  const member = await stmts.findRoomMember(req.params.id, req.user.id);
  if (!member) {
    return res.status(400).json({ error: '你不在该房间中' });
  }

  const roomId = parseInt(req.params.id);
  const userId = req.user.id;

  // 如果是房主离开，转让给最早加入的第二位成员
  const room = await stmts.findRoomById(roomId);
  if (room && room.creator_id === userId) {
    const nextMember = await stmts.findEarliestMemberExcept(roomId, userId);
    if (nextMember) {
      await stmts.updateRoomCreator(roomId, nextMember.user_id);
    }
  }

  await stmts.deleteRoomMember(roomId, userId);

  // 如果房间为空，删除房间
  const { count } = await stmts.countRoomMembers(roomId);
  if (count === 0) {
    await stmts.deleteRoom(roomId);
  }

  res.json({ success: true });
});

// DELETE /api/rooms/:id — 删除房间（创建者或管理员可删除）
router.delete('/:id', async (req, res) => {
  const room = await stmts.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  const isAdmin = req.user.is_admin === 1;
  if (room.creator_id !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: '只有房间创建者或管理员可以删除房间' });
  }

  await stmts.deleteRoom(req.params.id);
  res.json({ success: true });
});

module.exports = router;
