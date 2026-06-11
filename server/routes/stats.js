const express = require('express');
const { stmts } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// ==================== 工具：格式化时长为可读字符串 ====================
function formatDisplayTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours} 小时 ${mins} 分钟`;
  return `${mins} 分钟`;
}

function formatShortTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ==================== 计算连续学习天数 ====================
async function calculateStreak(userId) {
  const days = await stmts.getUserFocusDays(userId);
  if (!days || days.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const latestDate = new Date(days[0].date + 'T00:00:00');
  const diffFromToday = Math.floor((today - latestDate) / (1000 * 60 * 60 * 24));

  if (diffFromToday > 1) return 0;

  let streak = 0;
  const checkDate = new Date(latestDate);
  const sortedDates = days.map(d => d.date).sort();
  const dateSet = new Set(sortedDates);

  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (dateSet.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// GET /api/stats/personal — 个人专注统计（简版，保持向后兼容）
router.get('/personal', async (req, res) => {
  const result = await stmts.getUserFocusStats(req.user.id);
  const totalSeconds = result ? result.total_seconds : 0;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  res.json({
    userId: req.user.id,
    nickname: req.user.nickname,
    totalSeconds,
    totalMinutes,
    displayTime: hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`,
  });
});

// GET /api/stats/dashboard — 个人仪表盘（完整统计）
router.get('/dashboard', async (req, res) => {
  const userId = req.user.id;

  const total = await stmts.getUserFocusStats(userId);
  const totalSeconds = total ? total.total_seconds : 0;

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = await stmts.getUserDailyFocus(userId, today);
  const todaySeconds = todayStats ? todayStats.total_seconds : 0;

  const streak = await calculateStreak(userId);

  const weeklyData = await stmts.getUserWeeklyFocus(userId);
  const weekMap = {};
  for (const row of weeklyData) {
    weekMap[row.date] = row.total_seconds;
  }

  const weekDays = [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + mondayOffset + i);
    const dateStr = d.toISOString().slice(0, 10);
    const seconds = weekMap[dateStr] || 0;
    weekDays.push({
      date: dateStr,
      dayLabel: ['一', '二', '三', '四', '五', '六', '日'][i],
      totalSeconds: seconds,
      displayTime: formatShortTime(seconds),
      isToday: dateStr === today,
    });
  }

  const sessionCountResult = await stmts.getUserSessionCount(userId);
  const sessionCount = sessionCountResult ? sessionCountResult.count : 0;

  res.json({
    totalSeconds,
    todaySeconds,
    streak,
    sessionCount,
    weekDays,
    displayTotal: formatDisplayTime(totalSeconds),
    displayToday: formatDisplayTime(todaySeconds),
  });
});

// GET /api/stats/sessions — 最近学习记录
router.get('/sessions', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const sessions = await stmts.getUserSessions(req.user.id, limit);

  const result = sessions.map((s) => ({
    id: s.id,
    roomId: s.room_id,
    roomName: s.room_name || '(已删除的房间)',
    startTime: s.start_time,
    endTime: s.end_time,
    durationSeconds: s.duration_seconds,
    displayDuration: formatDisplayTime(s.duration_seconds),
  }));

  res.json({ sessions: result });
});

// GET /api/stats/leaderboard/:roomId — 房间排行榜
router.get('/leaderboard/:roomId', async (req, res) => {
  const leaderboard = await stmts.getRoomFocusLeaderboard(req.params.roomId);
  res.json({
    roomId: parseInt(req.params.roomId),
    leaderboard: leaderboard.map((entry, index) => ({
      rank: index + 1,
      userId: entry.user_id,
      nickname: entry.nickname,
      totalSeconds: entry.total_seconds,
      totalMinutes: Math.floor(entry.total_seconds / 60),
      displayTime: formatDisplayTime(entry.total_seconds),
    })),
  });
});

module.exports = router;
