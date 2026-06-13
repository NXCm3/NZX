import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// ===================================================================
// ✅ 显式初始化 Capacitor JS 桥（必须在 React 渲染前调用）
// - 不 import '@capacitor/core' 的话，window.Capacitor 可能未就绪
// - 这是确保 JS 层能检测到原生插件的关键一步
// ===================================================================
try {
  // @ts-ignore - 确保 @capacitor/core 被打包并初始化 bridge
  const cap = require('@capacitor/core');
  // 可选：注册自定义插件（如果原生层没自动注册的话，JS 层也可以兜底）
  console.log('[Bootstrap] @capacitor/core 已加载');
  // 打印当前环境信息
  if (typeof window !== 'undefined') {
    const wcap: any = (window as any).Capacitor;
    console.log('[Bootstrap] window.Capacitor 状态:', wcap ? '✅ 已注入' : '❌ 未注入');
    if (wcap && wcap.Plugins) {
      console.log('[Bootstrap] 当前可用插件:', Object.keys(wcap.Plugins).join(', '));
    }
  }
} catch (e) {
  console.warn('[Bootstrap] @capacitor/core 加载失败（浏览器环境正常）:', e);
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
