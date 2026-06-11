const express = require('express');
const bcrypt = require('bcryptjs');
const { stmts } = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register — 用户注册
router.post('/register', async (req, res) => {
  const { nickname, password } = req.body;

  if (!nickname || !password) {
    return res.status(400).json({ error: '昵称和密码不能为空' });
  }
  if (nickname.length < 2 || nickname.length > 20) {
    return res.status(400).json({ error: '昵称长度需在 2-20 个字符之间' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '密码长度至少 4 位' });
  }

  const existing = await stmts.findUserByNickname(nickname);
  if (existing) {
    return res.status(409).json({ error: '该昵称已被注册' });
  }

  // 首个注册用户自动成为管理员
  const userCount = await stmts.countUsers();
  const is_admin = (userCount && userCount.count === 0) ? 1 : 0;

  const password_hash = bcrypt.hashSync(password, 10);
  const result = await stmts.insertUser(nickname, password_hash, is_admin);

  const user = { id: result.lastInsertRowid, nickname, is_admin };
  const token = generateToken(user);

  res.status(201).json({ user, token });
});

// POST /api/auth/login — 用户登录
router.post('/login', async (req, res) => {
  const { nickname, password } = req.body;

  if (!nickname || !password) {
    return res.status(400).json({ error: '昵称和密码不能为空' });
  }

  const user = await stmts.findUserByNickname(nickname);
  if (!user) {
    return res.status(401).json({ error: '昵称或密码错误' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: '昵称或密码错误' });
  }

  const token = generateToken({ id: user.id, nickname: user.nickname, is_admin: user.is_admin });
  res.json({
    user: { id: user.id, nickname: user.nickname, is_admin: user.is_admin },
    token,
  });
});

// GET /api/auth/me — 获取当前用户信息（含 is_admin）
router.get('/me', authMiddleware, async (req, res) => {
  const user = await stmts.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

module.exports = router;
