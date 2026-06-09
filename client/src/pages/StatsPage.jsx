import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function StatsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [dashRes, sessRes] = await Promise.all([
          api.get('/stats/dashboard'),
          api.get('/stats/sessions', { params: { limit: 15 } }),
        ]);
        if (cancelled) return;
        setDashboard(dashRes.data);
        setSessions(sessRes.data.sessions);
      } catch (err) {
        if (!cancelled) setError('获取统计数据失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-500">加载统计数据...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">{error || '数据加载失败'}</p>
          <button onClick={() => navigate('/lobby')} className="mt-4 text-primary-600 hover:underline">返回大厅</button>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/lobby')} className="text-gray-400 hover:text-gray-600 transition p-1" title="返回大厅">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-2xl">📚</span>
            <h1 className="text-xl font-bold text-gray-800">我的学习数据</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">👋 {user?.nickname}</span>
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 transition">退出</button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* ====== 总览卡片 ====== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon="📊"
            label="累计专注"
            value={dashboard.displayTotal}
            color="bg-gradient-to-br from-primary-50 to-blue-50 border-primary-200"
          />
          <StatCard
            icon="📅"
            label="今日专注"
            value={dashboard.displayToday}
            color="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
          />
          <StatCard
            icon="🔥"
            label="连续天数"
            value={dashboard.streak > 0 ? `连续 ${dashboard.streak} 天` : '今天还没学习'}
            color="bg-gradient-to-br from-red-50 to-pink-50 border-red-200"
          />
          <StatCard
            icon="✅"
            label="学习次数"
            value={`${dashboard.sessionCount} 次`}
            color="bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200"
          />
        </div>

        {/* ====== 本周热力图 ====== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">📅 本周学习记录</h3>
          <div className="grid grid-cols-7 gap-2">
            {dashboard.weekDays.map((day) => {
              const maxSec = Math.max(...dashboard.weekDays.map(d => d.totalSeconds), 1);
              const height = Math.max(8, (day.totalSeconds / maxSec) * 120);
              const hasData = day.totalSeconds > 0;
              return (
                <div key={day.date} className="flex flex-col items-center gap-2">
                  {/* 柱状图 */}
                  <div className="w-full flex items-end justify-center" style={{ minHeight: '140px' }}>
                    <div
                      className={`w-full max-w-[40px] rounded-t-lg transition-all ${
                        day.isToday
                          ? hasData ? 'bg-primary-500' : 'bg-primary-100'
                          : hasData ? 'bg-primary-300' : 'bg-gray-100'
                      }`}
                      style={{ height: `${height}px` }}
                      title={day.displayTime}
                    />
                  </div>
                  {/* 时长 */}
                  <span className={`text-xs font-mono ${hasData ? 'text-gray-700 font-medium' : 'text-gray-300'}`}>
                    {day.displayTime}
                  </span>
                  {/* 星期 */}
                  <span className={`text-xs font-medium ${
                    day.isToday
                      ? 'text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full'
                      : 'text-gray-400'
                  }`}>
                    {day.isToday ? '今天' : `周${day.dayLabel}`}
                  </span>
                </div>
              );
            })}
          </div>
          {dashboard.weekDays.every(d => d.totalSeconds === 0) && (
            <p className="text-center text-gray-400 text-sm mt-4">本周还没有专注记录，快去自习吧！</p>
          )}
        </div>

        {/* ====== 最近学习记录 ====== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">📋 最近学习记录</h3>
          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📝</div>
              <p className="text-gray-400">还没有学习记录</p>
              <p className="text-gray-300 text-sm mt-1">加入房间开始专注学习吧！</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition border border-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-lg">
                      📖
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{s.roomName}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(s.startTime).toLocaleDateString('zh-CN', {
                          month: 'short', day: 'numeric',
                        })}
                        {' · '}
                        {new Date(s.startTime).toLocaleTimeString('zh-CN', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-primary-600 tabular-nums">
                    {s.displayDuration}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// 统计卡片子组件
function StatCard({ icon, label, value, color }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-800 truncate">{value}</p>
    </div>
  );
}
