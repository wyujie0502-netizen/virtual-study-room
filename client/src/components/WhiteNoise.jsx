import { useState, useEffect } from 'react';
import { whiteNoisePlayer, SOUND_CONFIG } from '../utils/sounds';

const SOUND_TYPES = Object.entries(SOUND_CONFIG).map(([key, cfg]) => ({ key, ...cfg }));

export default function WhiteNoise() {
  const [isOpen, setIsOpen] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [volume, setVolume] = useState(0.5);

  useEffect(() => {
    return () => { whiteNoisePlayer.stop(); };
  }, []);

  const handleToggle = (type) => {
    if (playing === type) {
      whiteNoisePlayer.stop();
      setPlaying(null);
    } else {
      whiteNoisePlayer.play(type);
      setPlaying(type);
    }
  };

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    whiteNoisePlayer.setVolume(vol);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
          playing
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
        title="环境音效"
      >
        🎵 {playing ? SOUND_CONFIG[playing]?.icon + ' ' + SOUND_CONFIG[playing]?.name : '白噪音'}
        {playing && (
          <span className="flex gap-0.5 ml-1">
            <span className="w-0.5 h-3 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
            <span className="w-0.5 h-3 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
            <span className="w-0.5 h-3 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-20 w-72">
            <h4 className="text-sm font-semibold text-gray-700 mb-1">环境音效</h4>
            <p className="text-xs text-gray-400 mb-3">选择背景音，助你专注</p>

            <div className="space-y-1.5">
              {SOUND_TYPES.map((sound) => (
                <button
                  key={sound.key}
                  onClick={() => handleToggle(sound.key)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all ${
                    playing === sound.key
                      ? 'bg-purple-50 text-purple-700 border-2 border-purple-200 shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{sound.icon}</span>
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium text-sm">{sound.name}</div>
                    <div className="text-xs text-gray-400 truncate">{sound.desc}</div>
                  </div>
                  {playing === sound.key && (
                    <div className="flex-shrink-0 flex gap-0.5">
                      <span className="w-0.5 h-4 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
                      <span className="w-0.5 h-4 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                      <span className="w-0.5 h-4 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {playing && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <span>🔈</span> 音量
                  </span>
                  <span className="text-xs font-mono text-gray-500">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-purple-600"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
