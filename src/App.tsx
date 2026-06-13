import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import UserHome from './pages/UserHome';
import VideoPlayer from './pages/VideoPlayer';
import UploadVideo from './pages/UploadVideo';
import DeleteVideosPage from './pages/DeleteVideosPage';
import SettingsPage from './pages/SettingsPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { checkAppVersion, clearCacheAndReload, APP_VERSION } from './utils/version';
import { loadThemeMode, applyThemeToDocument, getEffectiveTheme } from './utils/theme';
import { AppUpdateManager } from './components/UpdateDialog';
import UpdateAdmin from './components/UpdateAdmin';
import StandaloneUpdateAdmin from './pages/StandaloneUpdateAdmin';

// --------------------------------------------------------------------------
// 全局错误边界
// --------------------------------------------------------------------------
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const msg = (error && error.message) ? error.message : String(error);
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 捕获错误:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
    try { window.location.reload(); } catch (e) { /* ignore */ }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-8">
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-3">发生错误</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">软件运行时遇到了问题，请尝试重新加载。</p>
            <button onClick={this.handleRetry} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl text-base transition-colors active:scale-95">重新加载</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --------------------------------------------------------------------------
// 登录保护守卫
// --------------------------------------------------------------------------
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// --------------------------------------------------------------------------
// 首页路由守卫
// --------------------------------------------------------------------------
function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <UserHome />;
}

// --------------------------------------------------------------------------
// 登录页路由
// --------------------------------------------------------------------------
function LoginRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  if (user) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✓</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">已登录</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">当前用户：<span className="font-medium">{user.username}</span></p>
        <button onClick={() => navigate('/', { replace: true })} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl text-base transition-colors active:scale-95">进入首页</button>
      </div>
    </div>
  );
  return <LoginPage />;
}

// --------------------------------------------------------------------------
// 路由导航历史管理（返回键处理）
//
// 🔴 核心修复（v2，单一真理来源）：
//   1. 原生层（MainActivity.onBackPressed）是事件进入点
//   2. 原生层通过 evaluateJavascript 调用 window.__HANDLE_BACK__()
//   3. JS 层在这里定义该函数，决定是返回上一页还是退出
//   4. 返回值：{ action: 'BACK_HANDLED' | 'NEED_EXIT' | 'EXIT_NOW' }
//   5. 不再使用 Capacitor.Plugins.App.addListener('backButton') — 避免双重处理
// --------------------------------------------------------------------------
function NavigationManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // 用 ref 保存"最新快照"，避免闭包陈旧问题
  const latestRef = React.useRef({ pathname: location.pathname, user: user });
  latestRef.current.pathname = location.pathname;
  latestRef.current.user = user;

  // 首页再按一次退出：记录上次按键时间
  const backPressedAtRef = React.useRef(0);

  // Toast 提示
  const toastElRef = React.useRef<HTMLDivElement | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const showToast = (text: string) => {
    try {
      if (!toastElRef.current) {
        toastElRef.current = document.createElement('div');
        toastElRef.current.style.cssText =
          'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);' +
          'background:rgba(0,0,0,0.8);color:#fff;padding:10px 18px;border-radius:999px;' +
          'font-size:14px;z-index:99999;pointer-events:none;transition:opacity 0.2s;';
        document.body.appendChild(toastElRef.current);
      }
      toastElRef.current.textContent = text;
      toastElRef.current.style.opacity = '1';
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        if (toastElRef.current) toastElRef.current.style.opacity = '0';
      }, 1800);
    } catch (e) { /* ignore */ }
  };

  // 页面挂载时：初始化 + 定义全局 __HANDLE_BACK__ 函数
  React.useEffect(() => {
    console.log('%c===============================================', 'color:#2563eb;font-weight:bold;');
    console.log('%c✅ NavigationManager 已挂载', 'color:#2563eb;font-weight:bold;');
    console.log('%c===============================================', 'color:#2563eb;font-weight:bold;');
    console.log('  初始 pathname:', location.pathname);
    console.log('  window.history.length:', window.history.length);

    // 🔴 核心：定义全局处理函数（被 Android 原生层调用）
    const handleBack = (): { action: string } => {
      const { pathname, user: currentUser } = latestRef.current;
      const historyLen = (window.history && window.history.length) ? window.history.length : 1;

      // === 🔴 控制台日志 — 每次按返回键都打印所有状态 ===
      console.log('%c===============================================', 'color:#dc2626;font-weight:bold;font-size:14px;');
      console.log('%c🔴 ===== 按下物理返回键 [JS 层] =====', 'color:#dc2626;font-weight:bold;font-size:14px;');
      console.log('%c===============================================', 'color:#dc2626;font-weight:bold;font-size:14px;');
      console.log('  ① 当前路由 pathname:', pathname);
      console.log('  ② window.history.length:', historyLen);
      console.log('  ③ 当前 hash:', window.location.hash);
      console.log('  ④ 是否登录:', currentUser ? '是' : '否');

      // 情况 1：登录页 + 已登录 → 回首页
      if (pathname === '/login' && currentUser) {
        console.log('%c  → 登录页 + 已登录 → navigate 到首页', 'color:#059669;font-weight:bold;');
        navigate('/', { replace: true });
        console.log('%c  ✅ 返回: BACK_HANDLED', 'color:#059669;font-weight:bold;');
        console.log('%c===============================================', 'color:#9ca3af;');
        return { action: 'BACK_HANDLED' };
      }

      // 情况 2：首页 / 无历史 → "再按一次退出"
      const HOME_PATHS = new Set(['/', '/home']);
      const isHome = HOME_PATHS.has(pathname);
      const canGoBack = (historyLen > 1) && !isHome;

      if (isHome || !canGoBack) {
        const now = Date.now();
        const diff = now - backPressedAtRef.current;
        console.log('%c  → 判断: 首页/无可退历史 → 进入"再按一次退出"逻辑', 'color:#d97706;font-weight:bold;');
        console.log('     时间差(ms):', diff, '(阈值=2000)');

        if (diff < 2000) {
          // 2 秒内连续按 → 真正退出
          backPressedAtRef.current = 0;
          console.log('%c  ❌ 2秒内连续按 → 返回 EXIT_NOW', 'color:#dc2626;font-weight:bold;');
          console.log('%c===============================================', 'color:#dc2626;font-weight:bold;');
          return { action: 'EXIT_NOW' };
        }

        // 首次按 → Toast 提示
        backPressedAtRef.current = now;
        console.log('%c  ✅ 首次按 → Toast "再按一次退出应用"，返回 NEED_EXIT', 'color:#10b981;font-weight:bold;');
        console.log('%c===============================================', 'color:#9ca3af;');
        showToast('再按一次退出应用');
        return { action: 'NEED_EXIT' };
      }

      // 情况 3：其他页面 → 返回上一页
      console.log('%c  → 非首页且有历史 → navigate(-1) / history.back()', 'color:#2563eb;font-weight:bold;');
      try {
        navigate(-1);
      } catch (e) {
        console.log('     navigate(-1) 失败 → 回退到 history.back()');
        window.history.back();
      }
      console.log('%c  ✅ 返回: BACK_HANDLED', 'color:#2563eb;font-weight:bold;');
      console.log('%c===============================================', 'color:#9ca3af;');
      return { action: 'BACK_HANDLED' };
    };

    // 🔴 暴露给原生层调用（MainActivity.onBackPressed → evaluateJavascript）
    (window as any).__HANDLE_BACK__ = handleBack;

    // 浏览器环境下：也监听浏览器的返回键（方便桌面调试）
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.log('[Desktop-Debug] Escape 键 → 模拟物理返回键');
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      (window as any).__HANDLE_BACK__ = null;
      window.removeEventListener('keydown', handleKeyDown);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (toastElRef.current && toastElRef.current.parentNode) {
        toastElRef.current.parentNode.removeChild(toastElRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 路由变化时打印
  React.useEffect(() => {
    console.log('%c📄 [JS-路由] 页面切换 → pathname:' + location.pathname + ', history.length:' + window.history.length, 'color:#10b981;font-weight:bold;');
  }, [location.pathname]);

  return null;
}

// --------------------------------------------------------------------------
// 主应用
// --------------------------------------------------------------------------
function App() {
  const [showUpdateNotice, setShowUpdateNotice] = useState(false);
  const [updateNoticeText, setUpdateNoticeText] = useState('');

  useEffect(() => {
    const result = checkAppVersion();
    if (result.isFirstVisit) {
      console.log('[版本检测] 首次访问，版本:', APP_VERSION);
      return;
    }
    if (result.isUpdate) {
      setUpdateNoticeText(`检测到版本更新: ${result.previousVersion} → ${APP_VERSION}，正在加载最新版本...`);
      setShowUpdateNotice(true);
      setTimeout(() => { clearCacheAndReload(); }, 1200);
      return;
    }
    console.log('[版本检测] 当前版本:', APP_VERSION);
  }, []);

  // 主题管理：
  // 1. 初始化时应用主题
  // 2. auto 模式下每 60 秒检查一次时间，在 7:00 和 18:00 附近自动切换
  useEffect(() => {
    let currentMode = loadThemeMode();
    let lastApplied = getEffectiveTheme(currentMode);

    // 初始化应用
    applyThemeToDocument(currentMode);

    // 每 60 秒检查一次是否需要切换主题
    const intervalId = setInterval(() => {
      currentMode = loadThemeMode();
      const nowEffective = getEffectiveTheme(currentMode);
      if (nowEffective !== lastApplied) {
        lastApplied = nowEffective;
        applyThemeToDocument(currentMode);
        console.log('[主题] 自动切换为:', nowEffective);
      }
    }, 60000);

    // 监听其他页面修改主题
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pref_theme') {
        currentMode = loadThemeMode();
        lastApplied = getEffectiveTheme(currentMode);
        applyThemeToDocument(currentMode);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return (
    <AuthProvider>
      <AppErrorBoundary>
        <HashRouter>
          <NavigationManager />
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {showUpdateNotice && (
              <div className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-900/95 flex flex-col items-center justify-center px-4">
                <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2">发现新版本</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md mb-3">{updateNoticeText}</p>
                <button onClick={clearCacheAndReload} className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">立即刷新</button>
              </div>
            )}

            {/* 应用启动时检查更新 (后台 API → APK 原生下载) */}
            <AppUpdateManager checkOnMount showInternalDialog={true} />

            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/" element={<HomeRoute />} />
              <Route path="/video/:id" element={<RequireAuth><VideoPlayer /></RequireAuth>} />
              <Route path="/upload" element={<RequireAuth><UploadVideo /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
              <Route path="/delete-videos" element={<RequireAuth><DeleteVideosPage /></RequireAuth>} />
              <Route path="/update-admin" element={<UpdateAdmin />} />
              <Route path="/update-admin-web" element={<StandaloneUpdateAdmin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </HashRouter>
      </AppErrorBoundary>
    </AuthProvider>
  );
}

export default App;
