export default function Leaderboard({ leaderboard }) {
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-4">
        🏆 房间排行榜 <span className="text-xs text-gray-400">（每 10 秒刷新）</span>
      </h3>

      {leaderboard.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-4">暂无专注记录</p>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry) => (
            <div
              key={entry.userId}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition"
            >
              {/* 排名 */}
              <div className="w-8 text-center text-lg">
                {entry.rank <= 3 ? medals[entry.rank - 1] : (
                  <span className="text-gray-400 text-sm font-medium">{entry.rank}</span>
                )}
              </div>
              {/* 昵称 */}
              <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                {entry.nickname}
              </span>
              {/* 时长 */}
              <span className="text-sm font-bold text-primary-600 tabular-nums">
                {entry.displayTime}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
