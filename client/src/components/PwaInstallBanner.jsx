import { useState, useEffect, useCallback } from 'react';

export default function PwaInstallBanner() {
  const [show, setShow] = useState(false);

  const check = useCallback(() => {
    // 直接读全局变量，不做状态中转
    if (window.__pwaInstallPrompt && !window.__pwaInstalled) {
      setShow(true);
    }
  }, []);

  useEffect(() => {
    // 立即检查（pwa-install.js 可能已经捕获了事件）
    check();

    // 持续监听
    window.addEventListener('pwa:installable', check);
    window.addEventListener('pwa:installed', () => setShow(false));

    // 兜底：每秒轮询一次，持续 60 秒（确保不遗漏）
    let ticks = 0;
    const timer = setInterval(() => {
      if (window.__pwaInstallPrompt && !window.__pwaInstalled) {
        setShow(true);
        clearInterval(timer);
      }
      if (++ticks > 60) clearInterval(timer);
    }, 1000);

    return () => {
      window.removeEventListener('pwa:installable', check);
      window.removeEventListener('pwa:installed', () => setShow(false));
      clearInterval(timer);
    };
  }, [check]);

  const handleInstall = async () => {
    const prompt = window.__pwaInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    window.__pwaInstallPrompt = null;
    window.__pwaInstalled = true;
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg">
      <div className="bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-4">
        <div className="text-3xl flex-shrink-0">📚</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">安装虚拟自习室</p>
          <p className="text-white/70 text-xs mt-0.5">像普通软件一样在桌面打开</p>
        </div>
        <button
          onClick={handleInstall}
          className="flex-shrink-0 px-5 py-2.5 bg-white text-primary-700 rounded-xl text-sm font-bold hover:bg-gray-100 transition active:scale-95"
        >
          安装
        </button>
        <button
          onClick={() => setShow(false)}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs transition flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
