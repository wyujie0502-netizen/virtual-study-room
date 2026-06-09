import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// 昵称首字母头像色
function avatarColor(nickname) {
  const colors = [
    'from-blue-400 to-blue-600', 'from-purple-400 to-purple-600',
    'from-pink-400 to-pink-600', 'from-indigo-400 to-indigo-600',
    'from-teal-400 to-teal-600', 'from-orange-400 to-orange-600',
    'from-cyan-400 to-cyan-600', 'from-rose-400 to-rose-600',
  ];
  let hash = 0;
  for (let i = 0; i < (nickname || '').length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const STAT_ICONS = {
  total: '📊',
  today: '📅',
  streak: '🔥',
  count: '✅',
};

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinDate, setJoinDate] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dashRes, sessRes, meRes] = await Promise.all([
          api.get('/stats/dashboard'),
          api.get('/stats/sessions', { params: { limit: 10 } }),
          api.get('/auth/me'),
        ]);
        if (cancelled) return;
        setDashboard(dashRes.data);
        setSessions(sessRes.data.sessions);
        setJoinDate(meRes.data.user?.created_at || '');
      } catch (err) {
        if (!cancelled) setError('加载数据失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">{error}</p>
          <button onClick={() => navigate('/lobby')} className="mt-4 text-primary-600 hover:underline">返回大厅</button>
        </div>
      </div>
    );
  }

  const dash = dashboard || {
    totalSeconds: 0, todaySeconds: 0, streak: 0, sessionCount: 0,
    displayTotal: '0 分钟', displayToday: '0 分钟',
    weekDays: [],
    focusHours: 0,
  };

  const formatJoinDate = joinDate
    ? new Date(joinDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : '未知';

  const maxWeekSec = Math.max(...(dash.weekDays || []).map(d => d.totalSeconds), 1);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ====== 顶部个人卡片 ====== */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 text-white">
        <div className="max-w-2xl mx-auto px-6 pt-8 pb-10">
          {/* 顶部操作栏 */}
          <div className="flex justify-between items-start mb-6">
            <button onClick={() => navigate('/lobby')} className="text-white/70 hover:text-white text-sm flex items-center gap-1 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              自习室
            </button>
            <div className="flex gap-3">
              <button onClick={handleLogout} className="text-white/60 hover:text-white text-sm transition">
                退出登录
              </button>
            </div>
          </div>

          {/* 头像 + 昵称 */}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${avatarColor(user?.nickname)} flex items-center justify-center text-white text-2xl font-bold shadow-lg ring-4 ring-white/20`}>
              {(user?.nickname || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{user?.nickname}</h1>
              <p className="text-white/60 text-sm mt-1">📅 {formatJoinDate} 加入</p>
            </div>
          </div>
        </div>
      </div>

      {/* ====== 快捷入口 ====== */}
      <div className="max-w-2xl mx-auto px-6 -mt-5">
        <div className="bg-white rounded-2xl shadow-lg p-1 grid grid-cols-3">
          <QuickAction icon="🏠" label="自习大厅" onClick={() => navigate('/lobby')} />
          <QuickAction icon="➕" label="创建房间" onClick={() => navigate('/lobby', { state: { openCreate: true } })} />
          <QuickAction icon="📖" label="开始专注" onClick={() => navigate('/lobby')} />
        </div>
      </div>

      {/* ====== 数据概览 ====== */}
      <div className="max-w-2xl mx-auto px-6 mt-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">学习概览</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon="📊" label="累计专注" value={dash.displayTotal} color="text-primary-600" bg="bg-primary-50" />
          <StatTile icon="📅" label="今日专注" value={dash.displayToday} color="text-amber-600" bg="bg-amber-50" />
          <StatTile icon="🔥" label="连续天数" value={dash.streak > 0 ? `${dash.streak} 天` : '0 天'} color="text-red-600" bg="bg-red-50" />
          <StatTile icon="✅" label="学习次数" value={`${dash.sessionCount} 次`} color="text-emerald-600" bg="bg-emerald-50" />
        </div>
      </div>

      {/* ====== 本周热力图 ====== */}
      <div className="max-w-2xl mx-auto px-6 mt-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">本周学习</h2>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="grid grid-cols-7 gap-2">
            {(dash.weekDays || []).map((day) => {
              const height = Math.max(6, (day.totalSeconds / maxWeekSec) * 100);
              const hasData = day.totalSeconds > 0;
              return (
                <div key={day.date} className="flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end justify-center" style={{ minHeight: '110px' }}>
                    <div
                      className={`w-full max-w-[32px] rounded-t-md transition-all duration-500 ${
                        day.isToday
                          ? hasData ? 'bg-primary-500 shadow-sm' : 'bg-primary-100'
                          : hasData ? 'bg-primary-300' : 'bg-gray-100'
                      }`}
                      style={{ height: `${height}px` }}
                      title={`${day.date}: ${day.displayTime}`}
                    />
                  </div>
                  <span className={`text-xs font-mono ${hasData ? 'text-gray-600 font-medium' : 'text-gray-300'}`}>
                    {day.displayTime}
                  </span>
                  <span className={`text-xs font-medium ${
                    day.isToday ? 'text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full' : 'text-gray-400'
                  }`}>
                    {day.isToday ? '今天' : `周${day.dayLabel}`}
                  </span>
                </div>
              );
            })}
          </div>
          {(dash.weekDays || []).every(d => d.totalSeconds === 0) && (
            <p className="text-center text-gray-400 text-sm mt-2">本周还没有专注记录，快去自习吧！</p>
          )}
        </div>
      </div>

      {/* ====== 最近记录 ====== */}
      <div className="max-w-2xl mx-auto px-6 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">最近记录</h2>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {sessions.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-2">📝</div>
              <p className="text-gray-400">还没有学习记录</p>
              <p className="text-gray-300 text-sm mt-1">加入房间开始专注吧！</p>
            </div>
          ) : (
            sessions.map((s, i) => (
              <div key={s.id} className={`flex items-center justify-between p-4 hover:bg-gray-50 transition ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">📖</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{s.roomName}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(s.startTime).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                      {' · '}
                      {new Date(s.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-primary-600 tabular-nums ml-3 flex-shrink-0">{s.displayDuration}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// 快捷入口
function QuickAction({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 py-3 rounded-xl hover:bg-gray-50 transition active:scale-95">
      <span className="text-2xl">{icon}</span>
      <span className="text-xs text-gray-600 font-medium">{label}</span>
    </button>
  );
}

// 统计方块
function StatTile({ icon, label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-xl p-4 flex items-center gap-3`}>
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-base font-bold ${color} truncate`}>{value}</p>
      </div>
    </div>
  );
}
