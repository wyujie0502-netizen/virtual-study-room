import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// 格式化秒数为 MM:SS
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const MODES = [
  { key: 'pomodoro', label: '🍅 番茄钟', desc: '专注 + 休息循环' },
  { key: 'stopwatch', label: '⏱️ 正计时', desc: '自由专注，随时停止' },
  { key: 'countdown', label: '⏲️ 倒计时', desc: '设定目标时长' },
];

export default function Timer({ timerState, onStart, onStop, onCancel }) {
  const { user } = useAuth();
  const {
    mode = 'pomodoro',
    phase,
    remaining,
    elapsed,
    totalDuration,
    startedBy,
    focusDuration,
    breakDuration,
  } = timerState;

  // 当前选择的模式（仅在 idle 时可切换）
  const [selectedMode, setSelectedMode] = useState('pomodoro');
  const [customFocus, setCustomFocus] = useState(25);
  const [customBreak, setCustomBreak] = useState(5);
  const [countdownMin, setCountdownMin] = useState(30);

  const isIdle = phase === 'idle';
  const isFocusing = phase === 'focusing';
  const isResting = phase === 'resting';

  // 根据模式计算显示的进度和时间
  let progress, displayTime, progressColor;
  if (mode === 'stopwatch') {
    // 正计时：从 0 往上
    progress = 0; // 无固定上限，环不做进度
    displayTime = formatTime(elapsed || 0);
    progressColor = '#10b981';
  } else if (isIdle && mode === 'pomodoro') {
    progress = 100;
    displayTime = formatTime(focusDuration || 25 * 60);
    progressColor = '#9ca3af';
  } else if (isIdle && mode === 'countdown') {
    progress = 100;
    displayTime = formatTime(totalDuration || 30 * 60);
    progressColor = '#9ca3af';
  } else {
    // 倒计时/番茄钟进行中
    progress = totalDuration > 0 ? (remaining / totalDuration) * 100 : 100;
    displayTime = formatTime(remaining || 0);
    progressColor = isFocusing ? '#f59e0b' : '#10b981';
  }

  const phaseLabel = isFocusing
    ? '🔴 专注中'
    : isResting
    ? '🟢 休息中'
    : '⏸️ 等待开始';

  const phaseBgColor = isFocusing
    ? 'from-amber-400 to-orange-500 text-white'
    : isResting
    ? 'from-emerald-400 to-green-500 text-white'
    : 'from-gray-100 to-gray-200 text-gray-500';

  const handleStart = () => {
    if (selectedMode === 'pomodoro') {
      onStart({ mode: 'pomodoro', focusDuration: customFocus, breakDuration: customBreak });
    } else if (selectedMode === 'stopwatch') {
      onStart({ mode: 'stopwatch' });
    } else {
      onStart({ mode: 'countdown', duration: countdownMin * 60 });
    }
  };

  const isRunning = !isIdle;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-3 text-center">⏱️ 全局计时器</h3>

      {/* 模式选择器 - 仅在 idle 时可切换 */}
      {isIdle && (
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setSelectedMode(m.key)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition ${
                selectedMode === m.key
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title={m.desc}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* 进行中的模式标签 */}
      {isRunning && (
        <div className="text-center mb-3">
          <span className={`text-xs px-3 py-1 rounded-full ${
            mode === 'stopwatch' ? 'bg-emerald-100 text-emerald-700' :
            mode === 'countdown' ? 'bg-blue-100 text-blue-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {mode === 'stopwatch' ? '⏱️ 正计时' : mode === 'countdown' ? '⏲️ 倒计时' : '🍅 番茄钟'}
          </span>
        </div>
      )}

      {/* 进度环 */}
      <div className="relative w-40 h-40 mx-auto mb-4">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          {/* 正计时模式：动画填充环 */}
          {mode === 'stopwatch' && isFocusing ? (
            <circle
              cx="50" cy="50" r="44" fill="none" stroke={progressColor}
              strokeWidth="8" strokeLinecap="round" opacity="0.3"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset="0"
            >
              <animateTransform attributeName="transform" type="rotate"
                from="0 50 50" to="360 50 50" dur="60s" repeatCount="indefinite" />
            </circle>
          ) : (
            <circle
              cx="50" cy="50" r="44" fill="none" stroke={progressColor}
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - Math.min(progress, 100) / 100)}`}
              className="transition-all duration-1000"
            />
          )}
        </svg>
        {/* 中间文字 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold tabular-nums ${
            isFocusing ? 'text-amber-600' :
            isResting ? 'text-emerald-600' :
            'text-gray-400'
          }`}>
            {displayTime}
          </span>
          <span className={`text-xs mt-1 ${
            isFocusing ? 'text-amber-500' :
            isResting ? 'text-emerald-500' :
            'text-gray-400'
          }`}>
            {isFocusing ? '专注' : isResting ? '休息' : '就绪'}
          </span>
        </div>
      </div>

      {/* 阶段标签 */}
      <div className={`text-center py-1.5 rounded-full text-sm font-medium mb-4 bg-gradient-to-r ${phaseBgColor}`}>
        {phaseLabel}
      </div>

      {/* 参数设置 - 仅在 idle 时显示 */}
      {isIdle && selectedMode === 'pomodoro' && (
        <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
          <div className="flex-1 text-center bg-gray-50 rounded-lg py-2">
            <span className="block text-gray-400">专注</span>
            <div className="flex items-center justify-center gap-1 mt-1">
              <button onClick={() => setCustomFocus(Math.max(5, customFocus - 5))} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none">−</button>
              <span className="font-mono font-bold text-gray-700 w-8">{customFocus}</span>
              <button onClick={() => setCustomFocus(Math.min(60, customFocus + 5))} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none">+</button>
              <span className="text-gray-400">分</span>
            </div>
          </div>
          <span className="text-gray-300">→</span>
          <div className="flex-1 text-center bg-gray-50 rounded-lg py-2">
            <span className="block text-gray-400">休息</span>
            <div className="flex items-center justify-center gap-1 mt-1">
              <button onClick={() => setCustomBreak(Math.max(1, customBreak - 1))} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none">−</button>
              <span className="font-mono font-bold text-gray-700 w-6">{customBreak}</span>
              <button onClick={() => setCustomBreak(Math.min(30, customBreak + 1))} className="w-5 h-5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none">+</button>
              <span className="text-gray-400">分</span>
            </div>
          </div>
        </div>
      )}

      {isIdle && selectedMode === 'countdown' && (
        <div className="flex items-center justify-center gap-2 mb-4 text-xs text-gray-500">
          <span>目标时长：</span>
          <button onClick={() => setCountdownMin(Math.max(1, countdownMin - 5))} className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none">−</button>
          <span className="font-mono font-bold text-gray-700 text-lg w-10 text-center">{countdownMin}</span>
          <button onClick={() => setCountdownMin(Math.min(120, countdownMin + 5))} className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none">+</button>
          <span className="text-gray-400">分钟</span>
        </div>
      )}

      {isIdle && selectedMode === 'stopwatch' && (
        <div className="text-center mb-4">
          <p className="text-xs text-gray-400">正计时模式下无时间限制，准备就绪后开始专注</p>
        </div>
      )}

      {/* 按钮 */}
      {isIdle && (
        <button
          onClick={handleStart}
          className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-lg font-medium hover:from-amber-500 hover:to-orange-600 focus:ring-2 focus:ring-amber-300 transition"
        >
          {selectedMode === 'stopwatch' ? '▶ 开始专注' : selectedMode === 'countdown' ? '▶ 开始倒计时' : '🍅 开始番茄钟'}
        </button>
      )}

      {/* 正计时：任何人都可以停止 */}
      {isFocusing && mode === 'stopwatch' && (
        <button
          onClick={onStop}
          className="w-full py-2.5 bg-gradient-to-r from-emerald-400 to-green-500 text-white rounded-lg font-medium hover:from-emerald-500 hover:to-green-600 transition"
        >
          ⏹ 结束计时
        </button>
      )}

      {/* 番茄钟/倒计时：仅启动者可取消 */}
      {isRunning && mode !== 'stopwatch' && startedBy === user?.id && (
        <button
          onClick={onCancel}
          className="w-full py-2 border border-red-200 text-red-500 rounded-lg font-medium text-sm hover:bg-red-50 transition"
        >
          取消计时
        </button>
      )}
      {isRunning && mode !== 'stopwatch' && startedBy !== user?.id && (
        <p className="text-xs text-center text-gray-400">
          计时进行中，仅启动者可取消
        </p>
      )}
    </div>
  );
}
