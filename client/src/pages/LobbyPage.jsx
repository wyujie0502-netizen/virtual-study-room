import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function LobbyPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinTarget, setJoinTarget] = useState(null);  // 待确认加入的房间
  const [joining, setJoining] = useState(false);

  // 支持从其他页面跳转时自动打开创建弹窗
  useEffect(() => {
    if (location.state?.openCreate) {
      setShowCreate(true);
      // 清除 state 避免重复触发
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  // 获取房间列表
  const fetchRooms = async () => {
    try {
      const res = await api.get('/rooms');
      setRooms(res.data.rooms);
    } catch (err) {
      console.error('获取房间列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const timer = setInterval(fetchRooms, 8000);
    return () => clearInterval(timer);
  }, []);

  // 创建房间
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!roomName.trim()) return setCreateError('请输入房间名称');

    setCreating(true);
    try {
      const res = await api.post('/rooms', { name: roomName.trim(), is_private: isPrivate });
      setShowCreate(false);
      setRoomName('');
      setIsPrivate(false);
      // 把房间数据通过路由 state 传给 RoomPage，跳过 HTTP join
      navigate(`/room/${res.data.room.id}`, { state: { roomData: res.data.room } });
    } catch (err) {
      setCreateError(err.response?.data?.error || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  // 点击房间卡片 → 弹出确认框
  const handleRoomClick = (room) => {
    setJoinTarget(room);
  };

  // 确认加入房间
  const handleConfirmJoin = async () => {
    if (!joinTarget) return;
    const { id, is_private } = joinTarget;
    setJoining(true);
    try {
      if (is_private) {
        const res = await api.get(`/rooms/${id}`);
        navigate(`/room/${id}`, { state: { roomData: res.data.room } });
      } else {
        const res = await api.post(`/rooms/${id}/join`);
        navigate(`/room/${id}`, { state: { roomData: res.data.room } });
      }
    } catch (err) {
      alert(err.response?.data?.error || '加入失败');
      setJoinTarget(null);
    } finally {
      setJoining(false);
    }
  };

  // 删除房间
  const handleDeleteRoom = async (e, roomId) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这个房间吗？')) return;
    try {
      await api.delete(`/rooms/${roomId}`);
      fetchRooms();
    } catch (err) {
      alert(err.response?.data?.error || '删除失败');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/home')} className="text-gray-400 hover:text-gray-600 transition p-1" title="个人主页">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-2xl">📚</span>
            <h1 className="text-xl font-bold text-gray-800">自习房间</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/home')} className="text-sm text-gray-500 hover:text-primary-600 transition">
              🏠 我的主页
            </button>
            <span className="text-sm text-gray-600">👋 {user?.nickname}</span>
            <button onClick={() => { logout(); navigate('/login'); }} className="text-sm text-gray-400 hover:text-red-500 transition">
              退出
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">所有房间</h2>
            <p className="text-gray-500 mt-1">选择一个房间，开始专注学习</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 transition">
            + 创建房间
          </button>
        </div>

        {/* 创建房间弹窗 */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowCreate(false); setCreateError(''); }}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">创建自习房间</h3>
              {createError && (
                <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{createError}</div>
              )}
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">房间名称</label>
                  <input
                    type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="例如：考研自习室" maxLength={30} autoFocus
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                  <span className="text-sm text-gray-600">设为私密房间（仅自己可见）</span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowCreate(false); setCreateError(''); }}
                    className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition">
                    取消
                  </button>
                  <button type="submit" disabled={creating}
                    className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition">
                    {creating ? '创建中...' : '创建并进入'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 加入房间确认弹窗 */}
        {joinTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setJoinTarget(null)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-4">
                <div className="text-5xl mb-3">{joinTarget.is_private ? '🔒' : '🌐'}</div>
                <h3 className="text-lg font-semibold text-gray-800">{joinTarget.name}</h3>
                <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-500">
                  <span>👤 {joinTarget.member_count}/8</span>
                  <span>创建者: {joinTarget.creator_nickname}</span>
                </div>
                <p className="text-xs text-gray-400 mt-3">确定要加入这个房间吗？</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setJoinTarget(null)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition">
                  取消
                </button>
                <button onClick={handleConfirmJoin} disabled={joining}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition">
                  {joining ? '加入中...' : '加入房间'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 房间列表 */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-400">加载中...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏠</div>
            <p className="text-gray-500 text-lg">还没有自习房间</p>
            <p className="text-gray-400 text-sm mt-1">点击上方按钮创建第一个房间吧！</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <div key={room.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-primary-200 transition cursor-pointer group relative"
                onClick={() => handleRoomClick(room)}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 group-hover:text-primary-600 transition truncate pr-2">{room.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                    room.is_private ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {room.is_private ? '🔒 私密' : '🌐 公开'}
                  </span>
                </div>
                <div className="flex items-center text-sm text-gray-500 gap-4">
                  <span>👤 {room.member_count}/8</span>
                  <span>创建者: {room.creator_nickname}</span>
                </div>
                <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-primary-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(room.member_count / 8) * 100}%` }} />
                </div>
                {/* 删除按钮（仅创建者可见） */}
                {room.creator_id === user?.id && (
                  <button
                    onClick={(e) => handleDeleteRoom(e, room.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition w-6 h-6 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center text-xs"
                    title="删除房间"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
