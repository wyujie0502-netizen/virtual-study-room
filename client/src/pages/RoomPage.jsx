import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import { whiteNoisePlayer } from '../utils/sounds';
import Timer from '../components/Timer';
import MemberList from '../components/MemberList';
import ChatBox from '../components/ChatBox';
import Leaderboard from '../components/Leaderboard';
import WhiteNoise from '../components/WhiteNoise';

const INITIAL_TIMER = {
  mode: 'pomodoro', phase: 'idle', remaining: 25 * 60, elapsed: 0,
  totalDuration: 25 * 60, focusDuration: 25 * 60, breakDuration: 5 * 60,
  startedBy: null,
};

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { getSocket, connected } = useSocket();

  // ✅ 从路由 state 获取房间数据（创建/加入时传入，跳过 HTTP join）
  const passedRoom = location.state?.roomData || null;
  const [room, setRoom] = useState(passedRoom);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [timerState, setTimerState] = useState(INITIAL_TIMER);
  const [error, setError] = useState('');
  const [httpJoinNeeded] = useState(!passedRoom); // 有预传数据就不需要 HTTP join
  const [fetching, setFetching] = useState(!passedRoom);
  const [fetchError, setFetchError] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const errorTimerRef = useRef(null);
  const socketRef = useRef(null);
  const listenersBoundRef = useRef(false);
  const joinSentRef = useRef(false);

  // ==================== HTTP join（仅在无预传数据时执行） ====================
  useEffect(() => {
    if (!httpJoinNeeded) return;
    let cancelled = false;

    async function fetchRoom() {
      try {
        const res = await api.post(`/rooms/${roomId}/join`);
        if (cancelled) return;
        setRoom(res.data.room);
        setFetching(false);
      } catch (err) {
        if (cancelled) return;
        setFetchError(err.response?.data?.error || '加入房间失败');
        setFetching(false);
      }
    }

    fetchRoom();
    return () => { cancelled = true; };
  }, [roomId, httpJoinNeeded]);

  // ==================== Socket 连接 ====================
  useEffect(() => {
    if (!room) return;           // 还没拿到房间数据
    if (!connected) return;      // socket 还没连上
    const socket = getSocket();
    if (!socket) return;

    socketRef.current = socket;

    // 发送 room:join（仅首次）
    if (!joinSentRef.current) {
      socket.emit('room:join', { roomId: parseInt(roomId) });
      joinSentRef.current = true;
    }

    // 防止 StrictMode 重复绑定
    if (listenersBoundRef.current) return;
    listenersBoundRef.current = true;

    const bind = () => {
      socket.on('room:state', (data) => {
        setRoom(data.room);
        setMembers(data.members || []);
        setMessages(data.messages || []);
        if (data.timer) setTimerState((prev) => ({ ...prev, ...data.timer }));
        if (data.leaderboard) setLeaderboard(data.leaderboard);
      });
      socket.on('member:joined', (data) => {
        setMembers((prev) => {
          const exists = prev.find((m) => m.userId === data.userId);
          return exists
            ? prev.map((m) => (m.userId === data.userId ? { ...m, ...data, isOnline: true } : m))
            : [...prev, { ...data, isOnline: true }];
        });
      });
      socket.on('member:left', (data) => setMembers((prev) => prev.filter((m) => m.userId !== data.userId)));
      socket.on('member:status', (data) => setMembers((prev) => prev.map((m) => (m.userId === data.userId ? { ...m, ...data } : m))));
      socket.on('members:update', setMembers);
      socket.on('timer:started', (data) => setTimerState((prev) => ({ ...prev, ...data })));
      socket.on('timer:tick', (data) => setTimerState((prev) => ({ ...prev, ...data })));
      socket.on('timer:phaseChange', (data) => {
        setTimerState((prev) => ({ ...prev, phase: data.phase }));
        showToast(data.message, data.message.includes('休息') ? 'success' : 'info');
      });
      socket.on('timer:cancelled', () => setTimerState(INITIAL_TIMER));
      socket.on('chat:message', (data) => setMessages((prev) => [...prev, data]));
      socket.on('leaderboard:update', setLeaderboard);
      socket.on('error', (data) => showToast(data.message, 'error'));
      socket.on('disconnect', () => setError('连接断开，正在重连...'));
      socket.io.on('reconnect', () => {
        setError('');
        socket.emit('room:reconnect', { roomId: parseInt(roomId) });
      });
      // 房主转让
      socket.on('room:ownerChanged', (data) => {
        setRoom((prev) => prev ? {
          ...prev,
          creator_id: data.newOwnerId,
          creator_nickname: data.newOwnerNickname,
        } : prev);
        showToast(data.message, 'info');
      });
      socket.on('room:updated', (data) => {
        if (data.room) setRoom(data.room);
      });
    };

    const showToast = (msg, type) => {
      setError(msg);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      const dur = type === 'success' ? 5000 : 4000;
      errorTimerRef.current = setTimeout(() => setError(''), dur);
    };

    bind();

    return () => {
      socket.off('room:state');
      socket.off('member:joined');
      socket.off('member:left');
      socket.off('member:status');
      socket.off('members:update');
      socket.off('timer:started');
      socket.off('timer:tick');
      socket.off('timer:phaseChange');
      socket.off('timer:cancelled');
      socket.off('chat:message');
      socket.off('leaderboard:update');
      socket.off('error');
      socket.off('disconnect');
      socket.io.off('reconnect');
      socket.off('room:ownerChanged');
      socket.off('room:updated');
      listenersBoundRef.current = false;
      joinSentRef.current = false;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [room, connected, roomId]);

  // ==================== 离开 & 删除 ====================
  const handleLeave = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    setShowLeaveConfirm(false);
    if (socketRef.current) socketRef.current.emit('room:leave');
    whiteNoisePlayer.stop();
    navigate('/lobby');
  }, [navigate]);

  const handleCancelLeave = useCallback(() => {
    setShowLeaveConfirm(false);
  }, []);

  const handleDeleteRoom = useCallback(async () => {
    if (!window.confirm('确定要删除这个房间吗？此操作不可撤销。')) return;
    try {
      await api.delete(`/rooms/${roomId}`);
      navigate('/lobby');
    } catch (err) {
      setError(err.response?.data?.error || '删除失败');
    }
  }, [roomId, navigate]);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.emit('room:leave');
      whiteNoisePlayer.stop();
    };
  }, []);

  // ==================== 操作 ====================
  const emit = (event, data) => socketRef.current?.emit(event, data);

  const handleStartTimer = (options) => emit('timer:start', options);
  const handleStopTimer = () => emit('timer:stop');
  const handleCancelTimer = () => emit('timer:cancel');
  const handleSendMessage = (content) => emit('chat:message', { content });

  // ==================== 加载中 / 错误 ====================
  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          {fetching ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
              <p className="mt-4 text-gray-500">加入房间中...</p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-4">😕</div>
              <p className="text-red-500 font-medium">{fetchError || '无法加入房间'}</p>
              <button onClick={() => navigate('/lobby')} className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">
                返回大厅
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const isCreator = room.creator_id === user?.id;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleLeave} className="text-gray-400 hover:text-gray-600 transition p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-800 truncate max-w-[200px]">{room.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${room.is_private ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
              {room.is_private ? '🔒 私密' : '🌐 公开'}
            </span>
            {!connected && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full animate-pulse">重连中</span>}
          </div>
          <div className="flex items-center gap-2">
            <WhiteNoise />
            <button onClick={() => navigate('/home')} className="px-3 py-1.5 text-sm text-gray-500 hover:text-primary-600 rounded-lg transition">🏠 主页</button>
            {isCreator && (
              <button onClick={handleDeleteRoom} className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition">🗑 删除</button>
            )}
          </div>
        </div>
      </nav>

      {error && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 mt-2">
          <div className={`px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
            error.includes('重连') || error.includes('断开') ? 'bg-red-500 text-white' :
            error.includes('休息') || error.includes('结束') ? 'bg-green-500 text-white' :
            'bg-amber-500 text-white'
          }`}>{error}</div>
        </div>
      )}

      {/* 离开确认弹窗 */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handleCancelLeave}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">🚪</div>
              <h3 className="text-lg font-semibold text-gray-800">离开房间</h3>
              <p className="text-sm text-gray-500 mt-2">
                确定要离开 <span className="font-medium text-gray-700">"{room.name}"</span> 吗？
              </p>
              {isCreator && members.length > 1 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                  ⚠️ 你是房主，离开后房主将自动转让给最早加入的成员
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={handleCancelLeave}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition">
                留下
              </button>
              <button onClick={handleConfirmLeave}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition">
                离开
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-1 space-y-4">
            <Timer timerState={timerState} onStart={handleStartTimer} onStop={handleStopTimer} onCancel={handleCancelTimer} />
            <MemberList members={members} />
          </div>
          <div className="lg:col-span-2 h-[calc(100vh-10rem)]">
            <ChatBox messages={messages} timerPhase={timerState.phase} onSend={handleSendMessage} />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <Leaderboard leaderboard={leaderboard} />
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-3">ℹ️ 房间信息</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between"><span>创建者</span><span className="font-medium text-gray-800">{room.creator_nickname}</span></div>
                <div className="flex justify-between"><span>人数</span><span>{members.length}/8</span></div>
                <div className="flex justify-between"><span>类型</span><span>{room.is_private ? '私密' : '公开'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
