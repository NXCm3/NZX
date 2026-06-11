import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import UserHome from './pages/UserHome';
import VideoPlayer from './pages/VideoPlayer';
import UploadVideo from './pages/UploadVideo';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { checkAppVersion, clearCacheAndReload, APP_VERSION } from './utils/version';

function App() {
  const theme = useTheme();

  // 🔴 版本检测与缓存管理状态
  const [showUpdateNotice, setShowUpdateNotice] = useState(false);
  const [updateNoticeText, setUpdateNoticeText] = useState('');

  // 🔴 应用启动时：检查版本号
  useEffect(() => {
    const result = checkAppVersion();

    // 首次访问 → 无需刷新
    if (result.isFirstVisit) {
      console.log('[版本检测] 首次访问，版本:', APP_VERSION);
      return;
    }

    // 版本变化（从旧版本升级）→ 清除缓存并刷新
    if (result.isUpdate) {
      setUpdateNoticeText(`检测到版本更新: ${result.previousVersion} → ${APP_VERSION}，正在加载最新版本...`);
      setShowUpdateNotice(true);
      console.log('[版本检测] 检测到更新:', result.previousVersion, '→', result.currentVersion);

      // 延迟刷新：让用户看到提示
      setTimeout(() => {
        clearCacheAndReload();
      }, 1200);
      return;
    }

    // 版本一致
    console.log('[版本检测] 当前版本:', APP_VERSION);
  }, []);

  return (
    <AuthProvider>
      <HashRouter>
        <div data-theme={theme} className="min-h-screen bg-gray-50 dark:bg-gray-900">
          {/* 版本更新提示条 */}
          {showUpdateNotice && (
            <div className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-900/95 flex flex-col items-center justify-center px-4">
              <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2">
                发现新版本
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md mb-3">
                {updateNoticeText}
              </p>
              <button
                onClick={clearCacheAndReload}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                立即刷新
              </button>
            </div>
          )}

          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadVideo />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<UserHome />} />
            <Route path="/video/:id" element={<VideoPlayer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </HashRouter>
    </AuthProvider>
  );
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole === 'admin' && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default App;
