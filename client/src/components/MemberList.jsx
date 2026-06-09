const STATUS_CONFIG = {
  focusing: { label: '专注中', color: 'bg-amber-400', textColor: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
  resting: { label: '休息中', color: 'bg-green-400', textColor: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
  offline: { label: '离线', color: 'bg-gray-300', textColor: 'text-gray-400', bgColor: 'bg-gray-50 border-gray-200' },
};

// 生成一致的彩色头像背景
function avatarColor(nickname) {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
    'bg-teal-500', 'bg-orange-500', 'bg-cyan-500', 'bg-rose-500',
  ];
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function MemberList({ members }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-4">
        👥 房间成员 ({members.length}/8)
      </h3>

      <div className="space-y-2.5">
        {members.map((m) => {
          const status = STATUS_CONFIG[m.status] || STATUS_CONFIG.offline;
          return (
            <div
              key={m.userId}
              className={`flex items-center gap-3 p-2.5 rounded-lg border transition ${status.bgColor} ${m.status === 'offline' ? 'opacity-60' : ''}`}
            >
              {/* 头像 */}
              <div className="relative flex-shrink-0">
                <div className={`w-10 h-10 ${avatarColor(m.nickname)} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                  {m.nickname.charAt(0).toUpperCase()}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${status.color} rounded-full border-2 border-white`} />
              </div>

              {/* 昵称和状态 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{m.nickname}</p>
                <p className={`text-xs ${status.textColor}`}>{status.label}</p>
              </div>
            </div>
          );
        })}

        {/* 空位显示 */}
        {Array.from({ length: Math.max(0, 8 - members.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-3 p-2.5 rounded-lg border border-dashed border-gray-200 bg-gray-50/50"
          >
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-400">空位</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
