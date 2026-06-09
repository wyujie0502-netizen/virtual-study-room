// ==================== PWA 安装提示 — 全局脚本 ====================
// 必须在 React 之前加载，确保 beforeinstallprompt 不丢失

(function () {
  'use strict';

  // 存储安装事件，供 React 组件读取
  window.__pwaInstallPrompt = null;
  window.__pwaInstalled = false;

  // 检查是否已在 standalone 模式运行
  if (window.matchMedia('(display-mode: standalone)').matches) {
    window.__pwaInstalled = true;
    console.log('[PWA] 已在独立窗口模式');
  }

  // 捕获 beforeinstallprompt（Chrome 可能在任何时机触发）
  window.addEventListener('beforeinstallprompt', function (e) {
    console.log('[PWA] beforeinstallprompt 触发！可安装');
    e.preventDefault();
    window.__pwaInstallPrompt = e;
    // 通知已挂载的 React 组件
    window.dispatchEvent(new CustomEvent('pwa:installable'));
  });

  // 安装完成
  window.addEventListener('appinstalled', function () {
    console.log('[PWA] 安装完成');
    window.__pwaInstalled = true;
    window.__pwaInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa:installed'));
  });

  console.log('[PWA] 安装检测脚本已就绪');
})();
