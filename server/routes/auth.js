const express = require('express');
const bcrypt = require('bcryptjs');
const { stmts } = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register — 用户注册
router.post('/register', (req, res) => {
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

  const existing = stmts.findUserByNickname(nickname);
  if (existing) {
    return res.status(409).json({ error: '该昵称已被注册' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = stmts.insertUser(nickname, password_hash);

  const user = { id: result.lastInsertRowid, nickname };
  const token = generateToken(user);

  res.status(201).json({ user, token });
});

// POST /api/auth/login — 用户登录
router.post('/login', (req, res) => {
  const { nickname, password } = req.body;

  if (!nickname || !password) {
    return res.status(400).json({ error: '昵称和密码不能为空' });
  }

  const user = stmts.findUserByNickname(nickname);
  if (!user) {
    return res.status(401).json({ error: '昵称或密码错误' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: '昵称或密码错误' });
  }

  const token = generateToken({ id: user.id, nickname: user.nickname });
  res.json({ user: { id: user.id, nickname: user.nickname }, token });
});

// GET /api/auth/me — 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  const user = stmts.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

module.exports = router;
