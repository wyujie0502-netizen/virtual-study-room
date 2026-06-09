const { stmts } = require('../db');
const { socketAuthMiddleware } = require('../middleware/auth');

// ==================== 房间状态存储（内存） ====================
const roomTimers = new Map();
const userSockets = new Map();
const userRooms = new Map();
const heartbeatTimeouts = new Map();
const activeFocusSessions = new Map();

// 超时阈值：5 秒无心跳视为离线
const OFFLINE_TIMEOUT = 5000;

// 计时模式
const TIMER_MODE = {
  POMODORO: 'pomodoro',
  STOPWATCH: 'stopwatch',
  COUNTDOWN: 'countdown',
};

// 默认时长（秒）
const DEFAULT_FOCUS = 25 * 60;
const DEFAULT_BREAK = 5 * 60;

// ==================== 工具函数 ====================

// 构建发送给客户端的计时器状态快照
function buildTimerSnapshot(timer) {
  const snap = {
    mode: timer.mode || TIMER_MODE.POMODORO,
    phase: timer.phase,
    startedBy: timer.startedBy,
  };
  if (timer.mode === TIMER_MODE.STOPWATCH) {
    snap.elapsed = timer.elapsed || 0;
    snap.totalDuration = 0; // 无上限
  } else if (timer.mode === TIMER_MODE.COUNTDOWN) {
    snap.remaining = timer.remaining;
    snap.totalDuration = timer.totalDuration;
  } else {
    // pomodoro (default)
    snap.remaining = timer.remaining;
    snap.totalDuration = timer.totalDuration;
    snap.focusDuration = timer.focusDuration || DEFAULT_FOCUS;
    snap.breakDuration = timer.breakDuration || DEFAULT_BREAK;
  }
  return snap;
}

function getRoomTimerState(roomId) {
  if (!roomTimers.has(roomId)) {
    roomTimers.set(roomId, {
      mode: TIMER_MODE.POMODORO,
      phase: 'idle',
      startedBy: null,
      startedAt: null,
      focusDuration: DEFAULT_FOCUS,
      breakDuration: DEFAULT_BREAK,
      totalDuration: DEFAULT_FOCUS,
      remaining: DEFAULT_FOCUS,
      elapsed: 0,
      intervalId: null,
    });
  }
  return roomTimers.get(roomId);
}

function resetRoomTimer(roomId) {
  const timer = roomTimers.get(roomId);
  if (timer) {
    if (timer.intervalId) clearInterval(timer.intervalId);
    if (timer.leaderboardInterval) clearInterval(timer.leaderboardInterval);
  }
  roomTimers.set(roomId, {
    mode: TIMER_MODE.POMODORO,
    phase: 'idle',
    startedBy: null,
    startedAt: null,
    focusDuration: DEFAULT_FOCUS,
    breakDuration: DEFAULT_BREAK,
    totalDuration: DEFAULT_FOCUS,
    remaining: DEFAULT_FOCUS,
    elapsed: 0,
    intervalId: null,
  });
}

function startFocusSession(userId, roomId) {
  if (!activeFocusSessions.has(userId)) {
    activeFocusSessions.set(userId, {
      userId,
      roomId,
      startedAt: new Date().toISOString(),
      lastTickAt: new Date().toISOString(),
    });
  }
}

function pauseFocusSession(userId) {
  const session = activeFocusSessions.get(userId);
  if (session) {
    const now = new Date().toISOString();
    const elapsed = Math.floor((Date.now() - new Date(session.lastTickAt).getTime()) / 1000);
    if (elapsed > 0) {
      session.accumulated = (session.accumulated || 0) + elapsed;
      session.lastTickAt = now;
    }
  }
}

function endFocusSession(userId) {
  const session = activeFocusSessions.get(userId);
  if (!session) return;

  const now = new Date();
  const startTime = new Date(session.lastTickAt);
  const accumulated = session.accumulated || 0;
  const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
  const totalSeconds = accumulated + elapsed;

  if (totalSeconds >= 10) {
    stmts.insertFocusSession(
      session.userId,
      session.roomId,
      session.startedAt,
      now.toISOString(),
      totalSeconds
    );
  }

  activeFocusSessions.delete(userId);
}

// 结束所有活跃的专注会话
function endAllFocusSessions(roomId) {
  for (const [uid, session] of activeFocusSessions) {
    if (session.roomId === roomId) {
      endFocusSession(uid);
    }
  }
}

// 将房间内所有在线成员设为指定状态
function setAllMembersStatus(roomId, status) {
  const members = stmts.findRoomMembers(roomId);
  for (const m of members) {
    if (userSockets.has(m.user_id)) {
      stmts.updateMemberStatus(status, roomId, m.user_id);
    }
  }
}

function getMembersForRoom(roomId) {
  const members = stmts.findRoomMembers(roomId);
  return members.map((m) => ({
    userId: m.user_id,
    nickname: m.nickname,
    status: m.status,
    isOnline: userSockets.has(m.user_id),
  }));
}

function broadcastToRoom(io, roomId, event, data, excludeSocketId) {
  if (excludeSocketId) {
    io.to(`room:${roomId}`).except(excludeSocketId).emit(event, data);
  } else {
    io.to(`room:${roomId}`).emit(event, data);
  }
}

function emitToRoom(io, roomId, event, data) {
  io.to(`room:${roomId}`).emit(event, data);
}

function getLeaderboardData(roomId) {
  const leaderboard = stmts.getRoomFocusLeaderboard(roomId);
  return leaderboard.map((entry, index) => ({
    rank: index + 1,
    userId: entry.user_id,
    nickname: entry.nickname,
    totalSeconds: entry.total_seconds,
    totalMinutes: Math.floor(entry.total_seconds / 60),
    displayTime: formatTime(entry.total_seconds),
  }));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function handleUserOffline(io, userId) {
  const roomId = userRooms.get(userId);
  const socketId = userSockets.get(userId);

  if (socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.connected) return;
  }

  userSockets.delete(userId);
  if (heartbeatTimeouts.has(userId)) {
    clearTimeout(heartbeatTimeouts.get(userId));
    heartbeatTimeouts.delete(userId);
  }

  if (roomId) {
    pauseFocusSession(userId);
    stmts.updateMemberStatus('offline', roomId, userId);
    emitToRoom(io, roomId, 'member:status', {
      userId,
      status: 'offline',
      isOnline: false,
    });
    emitToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
  }
}

function handleLeaveRoom(io, socket, userId, roomId) {
  // 检查是否为房主 — 如果是则转让给最早加入的第二位成员
  const room = stmts.findRoomById(roomId);
  let ownershipTransferred = false;
  if (room && room.creator_id === userId) {
    const nextMember = stmts.findEarliestMemberExcept(roomId, userId);
    if (nextMember) {
      stmts.updateRoomCreator(roomId, nextMember.user_id);
      ownershipTransferred = true;
      // 通知房间内所有人房主变更
      emitToRoom(io, roomId, 'room:ownerChanged', {
        oldOwnerId: userId,
        newOwnerId: nextMember.user_id,
        newOwnerNickname: nextMember.nickname,
        message: `房主已转让给 ${nextMember.nickname}`,
      });
      // 同时更新房间信息广播
      const updatedRoom = stmts.findRoomById(roomId);
      if (updatedRoom) {
        emitToRoom(io, roomId, 'room:updated', { room: updatedRoom });
      }
    }
  }

  socket.leave(`room:${roomId}`);
  userRooms.delete(userId);
  endFocusSession(userId);
  stmts.updateMemberStatus('offline', roomId, userId);

  broadcastToRoom(io, roomId, 'member:left', { userId });
  broadcastToRoom(io, roomId, 'member:status', {
    userId,
    status: 'offline',
    isOnline: false,
  });
  broadcastToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
  emitToRoom(io, roomId, 'leaderboard:update', getLeaderboardData(roomId));

  // 如果房间为空，清理定时器并删除房间
  const { count } = stmts.countRoomMembers(roomId);
  if (count === 0) {
    const timer = roomTimers.get(roomId);
    if (timer) {
      if (timer.leaderboardInterval) clearInterval(timer.leaderboardInterval);
      if (timer.intervalId) clearInterval(timer.intervalId);
    }
    resetRoomTimer(roomId);
    stmts.deleteRoom(roomId);
  }
}

// 检查房间是否还有人
function isRoomEmpty(roomId) {
  return ![...userRooms.values()].some((rid) => rid === roomId);
}

// 确保排行榜定时器运行
function ensureLeaderboardInterval(io, roomId, timer) {
  if (!timer.leaderboardInterval) {
    timer.leaderboardInterval = setInterval(() => {
      emitToRoom(io, roomId, 'leaderboard:update', getLeaderboardData(roomId));
    }, 10000);
  }
}

// ==================== 计时模式：番茄钟 Tick ====================
function runPomodoroTick(io, roomId, timer) {
  timer.intervalId = setInterval(() => {
    timer.remaining--;

    if (isRoomEmpty(roomId)) {
      clearInterval(timer.intervalId);
      if (timer.leaderboardInterval) clearInterval(timer.leaderboardInterval);
      resetRoomTimer(roomId);
      return;
    }

    if (timer.remaining <= 0) {
      clearInterval(timer.intervalId);

      if (timer.phase === 'focusing') {
        // 记录专注时长 → 进入休息期
        endAllFocusSessions(roomId);
        timer.phase = 'resting';
        timer.totalDuration = timer.breakDuration || DEFAULT_BREAK;
        timer.remaining = timer.totalDuration;
        setAllMembersStatus(roomId, 'resting');

        emitToRoom(io, roomId, 'timer:tick', buildTimerSnapshot(timer));
        emitToRoom(io, roomId, 'timer:phaseChange', {
          phase: 'resting',
          message: '专注时间结束，进入休息期！可以发送消息聊天',
        });
        emitToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
        emitToRoom(io, roomId, 'leaderboard:update', getLeaderboardData(roomId));

        // 启动休息倒计时
        runRestTick(io, roomId, timer);
      }
    } else {
      emitToRoom(io, roomId, 'timer:tick', buildTimerSnapshot(timer));
    }
  }, 1000);
}

// 休息期 tick
function runRestTick(io, roomId, timer) {
  timer.intervalId = setInterval(() => {
    timer.remaining--;

    if (isRoomEmpty(roomId)) {
      clearInterval(timer.intervalId);
      if (timer.leaderboardInterval) clearInterval(timer.leaderboardInterval);
      resetRoomTimer(roomId);
      return;
    }

    if (timer.remaining <= 0) {
      clearInterval(timer.intervalId);
      timer.phase = 'idle';
      timer.totalDuration = timer.focusDuration || DEFAULT_FOCUS;
      timer.remaining = timer.totalDuration;
      emitToRoom(io, roomId, 'timer:tick', buildTimerSnapshot(timer));
      emitToRoom(io, roomId, 'timer:phaseChange', {
        phase: 'idle',
        message: '休息时间结束，可以开始下一轮番茄钟',
      });
    } else {
      emitToRoom(io, roomId, 'timer:tick', buildTimerSnapshot(timer));
    }
  }, 1000);
}

// ==================== 计时模式：正计时 Tick ====================
function runStopwatchTick(io, roomId, timer) {
  timer.intervalId = setInterval(() => {
    timer.elapsed++;

    if (isRoomEmpty(roomId)) {
      clearInterval(timer.intervalId);
      if (timer.leaderboardInterval) clearInterval(timer.leaderboardInterval);
      // 正计时房间无人时自动结束并记录
      endAllFocusSessions(roomId);
      resetRoomTimer(roomId);
      return;
    }

    emitToRoom(io, roomId, 'timer:tick', buildTimerSnapshot(timer));
  }, 1000);
}

// ==================== 计时模式：倒计时 Tick ====================
function runCountdownTick(io, roomId, timer) {
  timer.intervalId = setInterval(() => {
    timer.remaining--;

    if (isRoomEmpty(roomId)) {
      clearInterval(timer.intervalId);
      if (timer.leaderboardInterval) clearInterval(timer.leaderboardInterval);
      endAllFocusSessions(roomId);
      resetRoomTimer(roomId);
      return;
    }

    if (timer.remaining <= 0) {
      clearInterval(timer.intervalId);
      // 倒计时结束 → 记录并回到 idle
      endAllFocusSessions(roomId);
      timer.phase = 'idle';
      setAllMembersStatus(roomId, 'resting');

      emitToRoom(io, roomId, 'timer:tick', buildTimerSnapshot(timer));
      emitToRoom(io, roomId, 'timer:phaseChange', {
        phase: 'idle',
        message: '倒计时结束！本次专注已完成',
      });
      emitToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
      emitToRoom(io, roomId, 'leaderboard:update', getLeaderboardData(roomId));
    } else {
      emitToRoom(io, roomId, 'timer:tick', buildTimerSnapshot(timer));
    }
  }, 1000);
}

// ==================== 主处理函数 ====================
function setupSocketHandlers(io) {
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    console.log(`[连接] 用户 ${socket.user.nickname} (ID:${userId}) 已连接`);

    userSockets.set(userId, socket.id);

    // ==================== 心跳检测 ====================
    function resetHeartbeat() {
      if (heartbeatTimeouts.has(userId)) {
        clearTimeout(heartbeatTimeouts.get(userId));
      }
      heartbeatTimeouts.set(
        userId,
        setTimeout(() => {
          handleUserOffline(io, userId);
        }, OFFLINE_TIMEOUT)
      );
    }

    socket.on('heartbeat', () => {
      resetHeartbeat();
      const roomId = userRooms.get(userId);
      if (roomId) {
        // 从数据库读取成员实际状态，避免覆盖番茄钟期间的「专注中」状态
        const member = stmts.findRoomMember(roomId, userId);
        const actualStatus = member ? member.status : 'resting';
        broadcastToRoom(io, roomId, 'member:status', {
          userId,
          status: actualStatus === 'offline' ? 'resting' : actualStatus,
          isOnline: true,
        });
      }
    });

    // ==================== 加入房间 ====================
    socket.on('room:join', (data) => {
      const { roomId } = data;
      if (roomId == null) return;

      const room = stmts.findRoomById(roomId);
      if (!room) {
        return socket.emit('error', { message: '房间不存在' });
      }

      if (room.is_private && room.creator_id !== userId) {
        return socket.emit('error', { message: '无权加入该房间' });
      }

      const { count } = stmts.countRoomMembers(roomId);
      if (count >= 8) {
        return socket.emit('error', { message: '房间已满（上限 8 人）' });
      }

      const existing = stmts.findRoomMember(roomId, userId);
      if (!existing) {
        stmts.insertRoomMember(roomId, userId, 'resting');
      }

      const prevRoomId = userRooms.get(userId);
      if (prevRoomId && prevRoomId !== roomId) {
        socket.leave(`room:${prevRoomId}`);
        broadcastToRoom(io, prevRoomId, 'member:left', { userId });
      }

      socket.join(`room:${roomId}`);
      userRooms.set(userId, roomId);
      stmts.updateMemberStatus('resting', roomId, userId);

      const timer = getRoomTimerState(roomId);
      const members = getMembersForRoom(roomId);
      const messages = stmts.findRecentMessages(roomId).reverse();

      socket.emit('room:state', {
        room,
        members,
        messages,
        timer: buildTimerSnapshot(timer),
        leaderboard: getLeaderboardData(roomId),
      });

      broadcastToRoom(io, roomId, 'member:joined', {
        userId,
        nickname: socket.user.nickname,
        status: 'resting',
      });
      broadcastToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));

      resetHeartbeat();
    });

    // ==================== 离开房间 ====================
    socket.on('room:leave', () => {
      const roomId = userRooms.get(userId);
      if (!roomId) return;
      handleLeaveRoom(io, socket, userId, roomId);
    });

    // ==================== 计时器：启动（支持三种模式） ====================
    socket.on('timer:start', (data = {}) => {
      const roomId = userRooms.get(userId);
      if (!roomId) return;

      const timer = getRoomTimerState(roomId);
      if (timer.phase === 'focusing' || timer.phase === 'resting') {
        return socket.emit('error', { message: '计时器已在进行中，请等待结束' });
      }

      const mode = data.mode || TIMER_MODE.POMODORO;
      if (!Object.values(TIMER_MODE).includes(mode)) {
        return socket.emit('error', { message: '无效的计时模式' });
      }

      // 初始化计时器
      timer.mode = mode;
      timer.phase = 'focusing';
      timer.startedBy = userId;
      timer.startedAt = new Date().toISOString();

      if (mode === TIMER_MODE.STOPWATCH) {
        timer.elapsed = 0;
      } else if (mode === TIMER_MODE.COUNTDOWN) {
        const duration = Math.min(Math.max(parseInt(data.duration) || DEFAULT_FOCUS, 60), 7200);
        timer.totalDuration = duration;
        timer.remaining = duration;
      } else {
        // pomodoro
        const focusMin = Math.min(Math.max(parseInt(data.focusDuration) || 25, 5), 60);
        const breakMin = Math.min(Math.max(parseInt(data.breakDuration) || 5, 1), 30);
        timer.focusDuration = focusMin * 60;
        timer.breakDuration = breakMin * 60;
        timer.totalDuration = timer.focusDuration;
        timer.remaining = timer.focusDuration;
      }

      // 所有在线成员切换为专注中
      const members = stmts.findRoomMembers(roomId);
      for (const m of members) {
        if (userSockets.has(m.user_id)) {
          stmts.updateMemberStatus('focusing', roomId, m.user_id);
          startFocusSession(m.user_id, roomId);
        }
      }

      // 排行榜定时器
      ensureLeaderboardInterval(io, roomId, timer);

      // 根据模式启动 tick
      if (mode === TIMER_MODE.STOPWATCH) {
        runStopwatchTick(io, roomId, timer);
      } else if (mode === TIMER_MODE.COUNTDOWN) {
        runCountdownTick(io, roomId, timer);
      } else {
        runPomodoroTick(io, roomId, timer);
      }

      const modeLabel = mode === TIMER_MODE.STOPWATCH ? '正计时' :
        mode === TIMER_MODE.COUNTDOWN ? '倒计时' : '番茄钟';

      emitToRoom(io, roomId, 'timer:started', {
        ...buildTimerSnapshot(timer),
        startedByNickname: socket.user.nickname,
        message: `${socket.user.nickname} 启动了${modeLabel}`,
      });
      emitToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
    });

    // ==================== 计时器：停止正计时 ====================
    socket.on('timer:stop', () => {
      const roomId = userRooms.get(userId);
      if (!roomId) return;

      const timer = getRoomTimerState(roomId);
      if (timer.mode !== TIMER_MODE.STOPWATCH) {
        return socket.emit('error', { message: '只有正计时模式可以手动停止' });
      }
      if (timer.phase !== 'focusing') {
        return socket.emit('error', { message: '计时器未在进行中' });
      }

      endAllFocusSessions(roomId);
      setAllMembersStatus(roomId, 'resting');
      resetRoomTimer(roomId);

      emitToRoom(io, roomId, 'timer:cancelled', {
        message: `${socket.user.nickname} 结束了计时`,
      });
      emitToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
      emitToRoom(io, roomId, 'leaderboard:update', getLeaderboardData(roomId));
    });

    // ==================== 计时器：取消（番茄钟/倒计时） ====================
    socket.on('timer:cancel', () => {
      const roomId = userRooms.get(userId);
      if (!roomId) return;

      const timer = getRoomTimerState(roomId);
      if (timer.startedBy !== userId) {
        return socket.emit('error', { message: '只有启动者可以取消' });
      }
      if (timer.phase === 'idle') {
        return socket.emit('error', { message: '计时器未在进行中' });
      }

      endAllFocusSessions(roomId);
      setAllMembersStatus(roomId, 'resting');
      resetRoomTimer(roomId);

      emitToRoom(io, roomId, 'timer:cancelled', {
        message: `${socket.user.nickname} 取消了计时`,
      });
      emitToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
      emitToRoom(io, roomId, 'leaderboard:update', getLeaderboardData(roomId));
    });

    // ==================== 聊天消息 ====================
    socket.on('chat:message', (data) => {
      const roomId = userRooms.get(userId);
      if (!roomId) return;

      const timer = getRoomTimerState(roomId);
      if (timer.phase === 'focusing') {
        return socket.emit('error', { message: '专注期间禁止发送消息' });
      }

      const { content } = data;
      if (!content || content.trim().length === 0) return;
      if (content.trim().length > 500) {
        return socket.emit('error', { message: '消息内容过长（最多 500 字）' });
      }

      const result = stmts.insertMessage(roomId, userId, content.trim());
      const message = {
        id: result.lastInsertRowid,
        roomId,
        userId,
        nickname: socket.user.nickname,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };

      emitToRoom(io, roomId, 'chat:message', message);
    });

    // ==================== 手动切换状态 ====================
    socket.on('status:change', (data) => {
      const roomId = userRooms.get(userId);
      if (!roomId) return;

      const timer = getRoomTimerState(roomId);
      const { status } = data;

      if (timer.phase === 'focusing') {
        return socket.emit('error', { message: '计时器专注期间不可切换状态' });
      }
      if (!['focusing', 'resting'].includes(status)) {
        return socket.emit('error', { message: '无效的状态' });
      }

      if (status === 'focusing') {
        startFocusSession(userId, roomId);
      } else if (status === 'resting') {
        endFocusSession(userId);
      }

      stmts.updateMemberStatus(status, roomId, userId);
      broadcastToRoom(io, roomId, 'member:status', {
        userId,
        status,
        isOnline: true,
      });
      broadcastToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
    });

    // ==================== 断开连接 ====================
    socket.on('disconnect', () => {
      console.log(`[断开] 用户 ${socket.user.nickname} (ID:${userId}) 已断开`);

      const roomId = userRooms.get(userId);
      pauseFocusSession(userId);

      if (roomId) {
        stmts.updateMemberStatus('offline', roomId, userId);
        broadcastToRoom(io, roomId, 'member:status', {
          userId,
          status: 'offline',
          isOnline: false,
        });
        broadcastToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));
      }

      userSockets.delete(userId);
      if (heartbeatTimeouts.has(userId)) {
        clearTimeout(heartbeatTimeouts.get(userId));
        heartbeatTimeouts.delete(userId);
      }
    });

    // ==================== 重连恢复 ====================
    socket.on('room:reconnect', (data) => {
      const { roomId } = data;
      if (roomId == null) return;

      const room = stmts.findRoomById(roomId);
      if (!room) return;

      const member = stmts.findRoomMember(roomId, userId);
      if (!member) return;

      userSockets.set(userId, socket.id);
      socket.join(`room:${roomId}`);
      userRooms.set(userId, roomId);

      const restoreStatus = member.status === 'offline' ? 'resting' : member.status;
      stmts.updateMemberStatus(restoreStatus, roomId, userId);

      const timer = getRoomTimerState(roomId);
      const members = getMembersForRoom(roomId);

      socket.emit('room:state', {
        room,
        members,
        messages: stmts.findRecentMessages(roomId).reverse(),
        timer: buildTimerSnapshot(timer),
        leaderboard: getLeaderboardData(roomId),
      });

      broadcastToRoom(io, roomId, 'member:status', {
        userId,
        status: restoreStatus,
        isOnline: true,
      });
      broadcastToRoom(io, roomId, 'members:update', getMembersForRoom(roomId));

      if (timer.phase === 'focusing') {
        if (!activeFocusSessions.has(userId)) {
          activeFocusSessions.set(userId, {
            userId,
            roomId,
            startedAt: new Date().toISOString(),
            lastTickAt: new Date().toISOString(),
            accumulated: 0,
          });
        }
      }

      resetHeartbeat();
    });

    resetHeartbeat();
  });

  // 定期清理离线用户
  setInterval(() => {
    for (const [uid, socketId] of userSockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket || !socket.connected) {
        handleUserOffline(io, uid);
      }
    }
  }, 10000);
}

module.exports = { setupSocketHandlers };
