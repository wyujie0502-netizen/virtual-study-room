const { createClient } = require('@libsql/client');
const path = require('path');

// 数据库连接：优先使用 Turso 云端 URL，否则回退到本地 SQLite
const dbUrl = process.env.LIBSQL_URL || `file:${path.join(__dirname, 'studyroom.db')}`;
const client = createClient({
  url: dbUrl,
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const isLocal = dbUrl.startsWith('file:');
console.log(`[数据库] 连接模式: ${isLocal ? '本地 SQLite' : 'Turso 云端'}`);
console.log(`[数据库] ${dbUrl}`);

// ==================== 数据库初始化（异步） ====================
async function initDB() {
  // 建表（使用 CREATE TABLE IF NOT EXISTS 保证幂等）
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_private INTEGER DEFAULT 0,
      password_hash TEXT,
      creator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'resting',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 兼容旧表：尝试添加新字段（忽略已存在的错误）
  const alterStatements = [
    'ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0',
    'ALTER TABLE rooms ADD COLUMN password_hash TEXT',
  ];
  for (const sql of alterStatements) {
    try { await client.execute(sql); } catch (e) { /* 字段已存在，忽略 */ }
  }

  console.log('[数据库] 初始化完成');
}

// ==================== 预编译查询方法（异步） ====================
const stmts = {
  // ---- Users ----
  findUserByNickname: async (nickname) => {
    const r = await client.execute({ sql: 'SELECT * FROM users WHERE nickname = ?', args: [nickname] });
    return r.rows[0] || null;
  },
  findUserById: async (id) => {
    const r = await client.execute({ sql: 'SELECT id, nickname, is_admin, created_at FROM users WHERE id = ?', args: [id] });
    return r.rows[0] || null;
  },
  insertUser: async (nickname, password_hash, is_admin = 0) => {
    const r = await client.execute({
      sql: 'INSERT INTO users (nickname, password_hash, is_admin) VALUES (?, ?, ?)',
      args: [nickname, password_hash, is_admin],
    });
    return { lastInsertRowid: r.lastInsertRowid ? Number(r.lastInsertRowid) : null };
  },
  countUsers: async () => {
    const r = await client.execute('SELECT COUNT(*) AS count FROM users');
    return r.rows[0];
  },
  findAllUsers: async () => {
    const r = await client.execute('SELECT id, nickname, is_admin, created_at FROM users ORDER BY created_at DESC');
    return r.rows;
  },

  // ---- Rooms ----
  findRoomById: async (id) => {
    const r = await client.execute({
      sql: `
        SELECT r.*, u.nickname AS creator_nickname,
          (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
        FROM rooms r
        JOIN users u ON r.creator_id = u.id
        WHERE r.id = ?
      `,
      args: [id],
    });
    return r.rows[0] || null;
  },
  findPublicRooms: async () => {
    // 公开房间 + 有密码的私密房间（对所有人可见）
    const r = await client.execute(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count,
        CASE WHEN r.password_hash IS NOT NULL AND r.password_hash != '' THEN 1 ELSE 0 END AS has_password
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      WHERE r.is_private = 0 OR (r.is_private = 1 AND r.password_hash IS NOT NULL AND r.password_hash != '')
      ORDER BY r.created_at DESC
    `);
    return r.rows;
  },
  findRoomByCreator: async (userId) => {
    const r = await client.execute({
      sql: `
        SELECT r.*, u.nickname AS creator_nickname,
          (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count,
          CASE WHEN r.password_hash IS NOT NULL AND r.password_hash != '' THEN 1 ELSE 0 END AS has_password
        FROM rooms r
        JOIN users u ON r.creator_id = u.id
        WHERE r.creator_id = ? AND r.is_private = 1 AND (r.password_hash IS NULL OR r.password_hash = '')
        ORDER BY r.created_at DESC
      `,
      args: [userId],
    });
    return r.rows;
  },
  findAllRooms: async () => {
    const r = await client.execute(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      ORDER BY r.created_at DESC
    `);
    return r.rows;
  },
  insertRoom: async (name, is_private, creator_id, password_hash = null) => {
    const r = await client.execute({
      sql: 'INSERT INTO rooms (name, is_private, creator_id, password_hash) VALUES (?, ?, ?, ?)',
      args: [name, is_private, creator_id, password_hash],
    });
    return { lastInsertRowid: r.lastInsertRowid ? Number(r.lastInsertRowid) : null };
  },

  // ---- Room Members ----
  findRoomMember: async (roomId, userId) => {
    const r = await client.execute({
      sql: 'SELECT * FROM room_members WHERE room_id = ? AND user_id = ?',
      args: [roomId, userId],
    });
    return r.rows[0] || null;
  },
  findRoomMembers: async (roomId) => {
    const r = await client.execute({
      sql: `
        SELECT rm.*, u.nickname
        FROM room_members rm
        JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ?
      `,
      args: [roomId],
    });
    return r.rows;
  },
  countRoomMembers: async (roomId) => {
    const r = await client.execute({
      sql: 'SELECT COUNT(*) AS count FROM room_members WHERE room_id = ?',
      args: [roomId],
    });
    return r.rows[0];
  },
  insertRoomMember: async (roomId, userId, status) => {
    const r = await client.execute({
      sql: 'INSERT INTO room_members (room_id, user_id, status) VALUES (?, ?, ?)',
      args: [roomId, userId, status],
    });
    return { lastInsertRowid: r.lastInsertRowid ? Number(r.lastInsertRowid) : null };
  },
  deleteRoomMember: async (roomId, userId) => {
    const r = await client.execute({
      sql: 'DELETE FROM room_members WHERE room_id = ? AND user_id = ?',
      args: [roomId, userId],
    });
    return { changes: r.rowsAffected };
  },
  updateMemberStatus: async (status, roomId, userId) => {
    const r = await client.execute({
      sql: 'UPDATE room_members SET status = ? WHERE room_id = ? AND user_id = ?',
      args: [status, roomId, userId],
    });
    return { changes: r.rowsAffected };
  },
  findEarliestMemberExcept: async (roomId, excludeUserId) => {
    const r = await client.execute({
      sql: `
        SELECT rm.user_id, u.nickname
        FROM room_members rm
        JOIN users u ON rm.user_id = u.id
        WHERE rm.room_id = ? AND rm.user_id != ?
        ORDER BY rm.joined_at ASC
        LIMIT 1
      `,
      args: [roomId, excludeUserId],
    });
    return r.rows[0] || null;
  },
  updateRoomCreator: async (roomId, newCreatorId) => {
    const r = await client.execute({
      sql: 'UPDATE rooms SET creator_id = ? WHERE id = ?',
      args: [newCreatorId, roomId],
    });
    return { changes: r.rowsAffected };
  },
  deleteRoom: async (id) => {
    await client.execute({ sql: 'DELETE FROM chat_messages WHERE room_id = ?', args: [id] });
    await client.execute({ sql: 'DELETE FROM focus_sessions WHERE room_id = ?', args: [id] });
    await client.execute({ sql: 'DELETE FROM room_members WHERE room_id = ?', args: [id] });
    await client.execute({ sql: 'DELETE FROM rooms WHERE id = ?', args: [id] });
  },

  // ---- Focus Sessions ----
  insertFocusSession: async (userId, roomId, startTime, endTime, durationSeconds) => {
    const r = await client.execute({
      sql: 'INSERT INTO focus_sessions (user_id, room_id, start_time, end_time, duration_seconds) VALUES (?, ?, ?, ?, ?)',
      args: [userId, roomId, startTime, endTime, durationSeconds],
    });
    return { lastInsertRowid: r.lastInsertRowid ? Number(r.lastInsertRowid) : null };
  },
  getUserFocusStats: async (userId) => {
    const r = await client.execute({
      sql: 'SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds FROM focus_sessions WHERE user_id = ?',
      args: [userId],
    });
    return r.rows[0] || { total_seconds: 0 };
  },
  getRoomFocusLeaderboard: async (roomId) => {
    const r = await client.execute({
      sql: `
        SELECT u.id AS user_id, u.nickname,
          COALESCE(SUM(fs.duration_seconds), 0) AS total_seconds
        FROM room_members rm
        JOIN users u ON rm.user_id = u.id
        LEFT JOIN focus_sessions fs ON fs.user_id = u.id AND fs.room_id = rm.room_id
        WHERE rm.room_id = ?
        GROUP BY u.id
        ORDER BY total_seconds DESC
      `,
      args: [roomId],
    });
    return r.rows;
  },
  getUserDailyFocus: async (userId, date) => {
    const r = await client.execute({
      sql: `
        SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
        FROM focus_sessions
        WHERE user_id = ? AND date(start_time) = ?
      `,
      args: [userId, date],
    });
    return r.rows[0] || { total_seconds: 0 };
  },
  getUserWeeklyFocus: async (userId) => {
    const r = await client.execute({
      sql: `
        SELECT date(start_time) AS date, SUM(duration_seconds) AS total_seconds
        FROM focus_sessions
        WHERE user_id = ? AND start_time >= date('now', '-6 days')
        GROUP BY date(start_time)
        ORDER BY date ASC
      `,
      args: [userId],
    });
    return r.rows;
  },
  getUserFocusDays: async (userId) => {
    const r = await client.execute({
      sql: 'SELECT DISTINCT date(start_time) AS date FROM focus_sessions WHERE user_id = ? ORDER BY date DESC',
      args: [userId],
    });
    return r.rows;
  },
  getUserSessionCount: async (userId) => {
    const r = await client.execute({
      sql: 'SELECT COUNT(*) AS count FROM focus_sessions WHERE user_id = ?',
      args: [userId],
    });
    return r.rows[0] || { count: 0 };
  },
  getUserSessions: async (userId, limit = 20) => {
    const r = await client.execute({
      sql: `
        SELECT fs.*, r.name AS room_name
        FROM focus_sessions fs
        LEFT JOIN rooms r ON fs.room_id = r.id
        WHERE fs.user_id = ?
        ORDER BY fs.start_time DESC
        LIMIT ?
      `,
      args: [userId, limit],
    });
    return r.rows;
  },

  // ---- Chat Messages ----
  insertMessage: async (roomId, userId, content) => {
    const r = await client.execute({
      sql: 'INSERT INTO chat_messages (room_id, user_id, content) VALUES (?, ?, ?)',
      args: [roomId, userId, content],
    });
    return { lastInsertRowid: r.lastInsertRowid ? Number(r.lastInsertRowid) : null };
  },
  findRecentMessages: async (roomId) => {
    const r = await client.execute({
      sql: `
        SELECT cm.*, u.nickname
        FROM chat_messages cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.room_id = ?
        ORDER BY cm.created_at DESC
        LIMIT 100
      `,
      args: [roomId],
    });
    return r.rows;
  },
};

module.exports = { initDB, stmts, client };
