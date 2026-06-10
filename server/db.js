const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'studyroom.db');
const db = new Database(dbPath);

// WAL 模式提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ==================== 建表 ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_private INTEGER DEFAULT 0,
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

// ==================== 预编译语句 ====================
const stmts = {
  // Users
  findUserByNickname: (nickname) =>
    db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname),
  findUserById: (id) =>
    db.prepare('SELECT id, nickname, created_at FROM users WHERE id = ?').get(id),
  insertUser: (nickname, password_hash) =>
    db.prepare('INSERT INTO users (nickname, password_hash) VALUES (?, ?)').run(nickname, password_hash),

  // Rooms
  findRoomById: (id) =>
    db.prepare(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      WHERE r.id = ?
    `).get(id),
  findPublicRooms: () =>
    db.prepare(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      WHERE r.is_private = 0
      ORDER BY r.created_at DESC
    `).all(),
  findRoomByCreator: (userId) =>
    db.prepare(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      WHERE r.creator_id = ? AND r.is_private = 1
      ORDER BY r.created_at DESC
    `).all(userId),
  insertRoom: (name, is_private, creator_id) =>
    db.prepare('INSERT INTO rooms (name, is_private, creator_id) VALUES (?, ?, ?)').run(name, is_private, creator_id),

  // Room Members
  findRoomMember: (roomId, userId) =>
    db.prepare('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId),
  findRoomMembers: (roomId) =>
    db.prepare(`
      SELECT rm.*, u.nickname
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
    `).all(roomId),
  countRoomMembers: (roomId) =>
    db.prepare('SELECT COUNT(*) AS count FROM room_members WHERE room_id = ?').get(roomId),
  insertRoomMember: (roomId, userId, status) =>
    db.prepare('INSERT INTO room_members (room_id, user_id, status) VALUES (?, ?, ?)').run(roomId, userId, status),
  deleteRoomMember: (roomId, userId) =>
    db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, userId),
  updateMemberStatus: (status, roomId, userId) =>
    db.prepare('UPDATE room_members SET status = ? WHERE room_id = ? AND user_id = ?').run(status, roomId, userId),
  findEarliestMemberExcept: (roomId, excludeUserId) =>
    db.prepare(`
      SELECT rm.user_id, u.nickname
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ? AND rm.user_id != ?
      ORDER BY rm.joined_at ASC
      LIMIT 1
    `).get(roomId, excludeUserId),
  updateRoomCreator: (roomId, newCreatorId) =>
    db.prepare('UPDATE rooms SET creator_id = ? WHERE id = ?').run(newCreatorId, roomId),
  deleteRoom: (id) => {
    db.prepare('DELETE FROM chat_messages WHERE room_id = ?').run(id);
    db.prepare('DELETE FROM focus_sessions WHERE room_id = ?').run(id);
    db.prepare('DELETE FROM room_members WHERE room_id = ?').run(id);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  },

  // Focus Sessions
  insertFocusSession: (userId, roomId, startTime, endTime, durationSeconds) =>
    db.prepare('INSERT INTO focus_sessions (user_id, room_id, start_time, end_time, duration_seconds) VALUES (?, ?, ?, ?, ?)').run(userId, roomId, startTime, endTime, durationSeconds),
  getUserFocusStats: (userId) =>
    db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds FROM focus_sessions WHERE user_id = ?').get(userId),
  getRoomFocusLeaderboard: (roomId) =>
    db.prepare(`
      SELECT u.id AS user_id, u.nickname,
        COALESCE(SUM(fs.duration_seconds), 0) AS total_seconds
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      LEFT JOIN focus_sessions fs ON fs.user_id = u.id AND fs.room_id = rm.room_id
      WHERE rm.room_id = ?
      GROUP BY u.id
      ORDER BY total_seconds DESC
    `).all(roomId),
  getUserDailyFocus: (userId, date) =>
    db.prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
      FROM focus_sessions
      WHERE user_id = ? AND date(start_time) = ?
    `).get(userId, date),
  getUserWeeklyFocus: (userId) =>
    db.prepare(`
      SELECT date(start_time) AS date, SUM(duration_seconds) AS total_seconds
      FROM focus_sessions
      WHERE user_id = ? AND start_time >= date('now', '-6 days')
      GROUP BY date(start_time)
      ORDER BY date ASC
    `).all(userId),
  getUserFocusDays: (userId) =>
    db.prepare(`
      SELECT DISTINCT date(start_time) AS date FROM focus_sessions WHERE user_id = ? ORDER BY date DESC
    `).all(userId),
  getUserSessionCount: (userId) =>
    db.prepare('SELECT COUNT(*) AS count FROM focus_sessions WHERE user_id = ?').get(userId),
  getUserSessions: (userId, limit = 20) =>
    db.prepare(`
      SELECT fs.*, r.name AS room_name
      FROM focus_sessions fs
      LEFT JOIN rooms r ON fs.room_id = r.id
      WHERE fs.user_id = ?
      ORDER BY fs.start_time DESC
      LIMIT ?
    `).all(userId, limit),

  // Chat Messages
  insertMessage: (roomId, userId, content) =>
    db.prepare('INSERT INTO chat_messages (room_id, user_id, content) VALUES (?, ?, ?)').run(roomId, userId, content),
  findRecentMessages: (roomId) =>
    db.prepare(`
      SELECT cm.*, u.nickname
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = ?
      ORDER BY cm.created_at DESC
      LIMIT 100
    `).all(roomId),
};

// better-sqlite3 是同步的，无需异步初始化
console.log('[数据库] SQLite 初始化完成（better-sqlite3）');

module.exports = { stmts, db };
