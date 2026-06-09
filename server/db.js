const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'studyroom.db');

let db;

// ==================== 初始化数据库 ====================
function initDatabase(SQL) {
  // 如果已有数据库文件，加载它
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // 创建表（如果不存在）
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_private INTEGER DEFAULT 0,
      creator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'resting',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(room_id, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  saveDatabase();
}

// ==================== 保存数据库到文件 ====================
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// ==================== 查询工具函数 ====================
// sql.js 的 prepare 返回的 stmt 使用方式：
// stmt.bind(params) -> stmt.step() -> stmt.getAsObject()
// 我们用 run/get/all 包装函数简化调用

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  // 先取 rowid 再保存，避免 export() 干扰状态
  const rowidRes = db.exec("SELECT last_insert_rowid()");
  const lastInsertRowid = (rowidRes.length && rowidRes[0].values.length)
    ? rowidRes[0].values[0][0]
    : 0;
  saveDatabase();
  return { lastInsertRowid };
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ==================== 预编译语句集 ====================
const stmts = {
  // Users
  findUserByNickname(nickname) {
    return get('SELECT * FROM users WHERE nickname = ?', [nickname]);
  },
  findUserById(id) {
    return get('SELECT id, nickname, created_at FROM users WHERE id = ?', [id]);
  },
  insertUser(nickname, password_hash) {
    return run('INSERT INTO users (nickname, password_hash) VALUES (?, ?)', [nickname, password_hash]);
  },

  // Rooms
  findRoomById(id) {
    return get(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      WHERE r.id = ?
    `, [id]);
  },
  findPublicRooms() {
    return all(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      WHERE r.is_private = 0
      ORDER BY r.created_at DESC
    `);
  },
  findRoomByCreator(userId) {
    return all(`
      SELECT r.*, u.nickname AS creator_nickname,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
      FROM rooms r
      JOIN users u ON r.creator_id = u.id
      WHERE r.creator_id = ? AND r.is_private = 1
      ORDER BY r.created_at DESC
    `, [userId]);
  },
  insertRoom(name, is_private, creator_id) {
    return run('INSERT INTO rooms (name, is_private, creator_id) VALUES (?, ?, ?)', [name, is_private, creator_id]);
  },

  // Room Members
  findRoomMember(roomId, userId) {
    return get('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  },
  findRoomMembers(roomId) {
    return all(`
      SELECT rm.*, u.nickname
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
    `, [roomId]);
  },
  countRoomMembers(roomId) {
    return get('SELECT COUNT(*) AS count FROM room_members WHERE room_id = ?', [roomId]);
  },
  insertRoomMember(roomId, userId, status) {
    return run('INSERT INTO room_members (room_id, user_id, status) VALUES (?, ?, ?)', [roomId, userId, status]);
  },
  deleteRoomMember(roomId, userId) {
    return run('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  },
  findEarliestMemberExcept(roomId, excludeUserId) {
    return get(`
      SELECT rm.user_id, u.nickname
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ? AND rm.user_id != ?
      ORDER BY rm.joined_at ASC
      LIMIT 1
    `, [roomId, excludeUserId]);
  },
  updateRoomCreator(roomId, newCreatorId) {
    return run('UPDATE rooms SET creator_id = ? WHERE id = ?', [newCreatorId, roomId]);
  },
  updateMemberStatus(status, roomId, userId) {
    return run('UPDATE room_members SET status = ? WHERE room_id = ? AND user_id = ?', [status, roomId, userId]);
  },
  deleteRoom(id) {
    // 手动级联删除关联数据（sql.js 中 PRAGMA foreign_keys 行为不可靠）
    run('DELETE FROM chat_messages WHERE room_id = ?', [id]);
    run('DELETE FROM focus_sessions WHERE room_id = ?', [id]);
    run('DELETE FROM room_members WHERE room_id = ?', [id]);
    return run('DELETE FROM rooms WHERE id = ?', [id]);
  },

  // Focus Sessions
  insertFocusSession(userId, roomId, startTime, endTime, durationSeconds) {
    return run(
      'INSERT INTO focus_sessions (user_id, room_id, start_time, end_time, duration_seconds) VALUES (?, ?, ?, ?, ?)',
      [userId, roomId, startTime, endTime, durationSeconds]
    );
  },
  getUserFocusStats(userId) {
    return get('SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds FROM focus_sessions WHERE user_id = ?', [userId]);
  },
  getRoomFocusLeaderboard(roomId) {
    return all(`
      SELECT u.id AS user_id, u.nickname,
        COALESCE(SUM(fs.duration_seconds), 0) AS total_seconds
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      LEFT JOIN focus_sessions fs ON fs.user_id = u.id AND fs.room_id = rm.room_id
      WHERE rm.room_id = ?
      GROUP BY u.id
      ORDER BY total_seconds DESC
    `, [roomId]);
  },
  getUserDailyFocus(userId, date) {
    return get(`
      SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
      FROM focus_sessions
      WHERE user_id = ? AND date(start_time) = ?
    `, [userId, date]);
  },
  getUserWeeklyFocus(userId) {
    return all(`
      SELECT date(start_time) AS date, SUM(duration_seconds) AS total_seconds
      FROM focus_sessions
      WHERE user_id = ? AND start_time >= date('now', '-6 days')
      GROUP BY date(start_time)
      ORDER BY date ASC
    `, [userId]);
  },
  getUserFocusDays(userId) {
    return all(`
      SELECT DISTINCT date(start_time) AS date
      FROM focus_sessions
      WHERE user_id = ?
      ORDER BY date DESC
    `, [userId]);
  },
  getUserSessionCount(userId) {
    return get(`
      SELECT COUNT(*) AS count FROM focus_sessions WHERE user_id = ?
    `, [userId]);
  },
  getUserSessions(userId, limit = 20) {
    return all(`
      SELECT fs.*, r.name AS room_name
      FROM focus_sessions fs
      LEFT JOIN rooms r ON fs.room_id = r.id
      WHERE fs.user_id = ?
      ORDER BY fs.start_time DESC
      LIMIT ?
    `, [userId, limit]);
  },

  // Chat Messages
  insertMessage(roomId, userId, content) {
    return run('INSERT INTO chat_messages (room_id, user_id, content) VALUES (?, ?, ?)', [roomId, userId, content]);
  },
  findRecentMessages(roomId) {
    return all(`
      SELECT cm.*, u.nickname
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = ?
      ORDER BY cm.created_at DESC
      LIMIT 100
    `, [roomId]);
  },
};

// ==================== 异步初始化 ====================
let ready = false;
let readyPromise = null;

function getDb() {
  return db;
}

function isReady() {
  return ready;
}

function waitForReady() {
  return readyPromise;
}

readyPromise = initSqlJs().then((SQL) => {
  initDatabase(SQL);
  ready = true;
  console.log('[数据库] SQLite 初始化完成');
  return { db, stmts };
});

module.exports = { stmts, getDb, saveDatabase, isReady, waitForReady: () => readyPromise, run, get, all };
