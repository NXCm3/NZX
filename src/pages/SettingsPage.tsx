import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Layout/Header';
import { applyThemeToDocument, saveThemeMode, getEffectiveTheme } from '../utils/theme';
import type { ThemeMode } from '../utils/theme';
import { UpdateDialog, useManualUpdateCheck } from '../components/UpdateDialog';
import { getNativeVersion, formatBytes } from '../services/appUpdate';

// 可用画质选项：原视频画质 + 360P + 160P
const QUALITY_OPTIONS = [
  { id: 'original', label: '原视频画质', description: '原始分辨率，画质最佳' },
  { id: '360p', label: '流畅 360P', description: '低画质，节省流量' },
  { id: '160p', label: '极速 160P', description: '最低画质，流量最少' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout, updateCurrentUser } = useAuth();

  // 用户偏好设置（保存在 localStorage）
  const [quality, setQuality] = useState<string>('original');
  const [theme, setTheme] = useState<ThemeMode>('auto');
  const [autoPlay, setAutoPlay] = useState<boolean>(true);

  // 应用更新
  const [nativeVersion, setNativeVersion] = useState({ version: '1.0.0', platform: 'web' });
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateDialogData, setUpdateDialogData] = useState<any>(null);
  const { checking, lastResult, runCheck } = useManualUpdateCheck();

  useEffect(() => {
    (async () => {
      const n = await getNativeVersion();
      setNativeVersion({ version: n.version, platform: n.platform });
    })();
  }, []);

  const handleCheckUpdate = async () => {
    console.log('%c===== [设置页] 点击检查更新 =====', 'color:#2563eb;font-weight:bold;font-size:16px;');
    console.log('当前 nativeVersion:', nativeVersion);

    const r = await runCheck();
    console.log('%c检查更新响应:', 'color:#16a34a;font-weight:bold;', JSON.stringify(r, null, 2));

    if (r.hasUpdate) {
      console.log('%c✅ 检测到新版本，准备显示弹窗', 'color:#16a34a;font-weight:bold;');
      setUpdateDialogData(r);
      setUpdateDialogOpen(true);
    } else {
      console.log('%c⚠️ 已是最新版本（或检测失败）', 'color:#f59e0b;font-weight:bold;');
      alert('当前已是最新版本\n\n调试信息:\n' + JSON.stringify(r, null, 2));
    }
  };

  // 修改密码相关状态
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 加载保存的设置
  useEffect(() => {
    try {
      const savedQuality = localStorage.getItem('pref_quality');
      const savedTheme = localStorage.getItem('pref_theme');
      const savedAutoPlay = localStorage.getItem('pref_autoplay');
      if (savedQuality) setQuality(savedQuality);
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto') setTheme(savedTheme);
      if (savedAutoPlay !== null) setAutoPlay(savedAutoPlay === '1');
    } catch (e) {
      // localStorage 读取失败时不阻塞页面
    }
  }, []);

  // 保存画质设置
  const handleQualityChange = (qualityId: string) => {
    setQuality(qualityId);
    try { localStorage.setItem('pref_quality', qualityId); } catch (e) {}
  };

  // 保存主题设置 - 立即应用到页面
  const handleThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    saveThemeMode(mode);
    applyThemeToDocument(mode);
  };

  // 保存自动播放设置
  const handleAutoPlayToggle = () => {
    const newValue = !autoPlay;
    setAutoPlay(newValue);
    try { localStorage.setItem('pref_autoplay', newValue ? '1' : '0'); } catch (e) {}
  };

  // 修改密码
  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('请填写完整的密码信息');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('新密码至少需要 4 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch('https://nzx-5o4.pages.dev/api/users/' + user?.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error('更新失败');
      const updatedUser = await res.json();
      if (updateCurrentUser) updateCurrentUser(updatedUser);
      setPasswordSuccess('密码修改成功！');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (e: any) {
      setPasswordError('密码修改失败，请稍后重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) {
      logout();
      navigate('/login');
    }
  };

  // 跳转到视频管理
  const gotoVideoManagement = () => {
    navigate('/delete-videos');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="账户设置" showBack />

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* 用户信息卡片 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-white font-bold text-xl sm:text-2xl shrink-0">
              {user.username?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                {user.username}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {user.role === 'admin' ? '🛡️ 管理员账户' : '👤 普通用户'}
              </p>
            </div>
          </div>
        </div>

        {/* 视频播放设置 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">⚙️</span>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">视频播放设置</h3>
          </div>

          {/* 画质选择 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              🎨 默认播放画质
            </label>
            <div className="space-y-2">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleQualityChange(opt.id)}
                  className={`w-full flex items-center justify-between p-3 sm:p-4 rounded-xl border-2 transition-all ${
                    quality === opt.id
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="text-left min-w-0 flex-1">
                    <p className={`font-medium text-sm sm:text-base ${quality === opt.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
                  </div>
                  {quality === opt.id && (
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shrink-0 ml-2 text-white text-xs font-bold">
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 自动播放开关 */}
          <div className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div className="min-w-0 flex-1 pr-3">
              <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">▶ 进入页面自动播放</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">打开视频页面时自动开始播放</p>
            </div>
            <button
              onClick={handleAutoPlayToggle}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                autoPlay ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  autoPlay ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 主题设置 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">{getEffectiveTheme(theme) === 'dark' ? '🌙' : '☀️'}</span>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">外观主题</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {([
              { id: 'auto' as const, label: '跟随系统', icon: '👁️' },
              { id: 'light' as const, label: '浅色', icon: '☀️' },
              { id: 'dark' as const, label: '深色', icon: '🌙' },
            ]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleThemeChange(opt.id)}
                className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border-2 transition-all ${
                  theme === opt.id
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                <span className="text-lg">{opt.icon}</span>
                <span className="text-xs sm:text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 修改密码 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔒</span>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">账户安全</h3>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">当前密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                placeholder="请输入当前密码"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                placeholder="至少 4 个字符"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                placeholder="再次输入新密码"
              />
            </div>
            {passwordError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl text-sm">
                ✓ {passwordSuccess}
              </div>
            )}
            <button
              onClick={handleChangePassword}
              disabled={passwordLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors active:scale-95 disabled:opacity-50 text-base"
            >
              {passwordLoading ? (
                <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> 保存中...</>
              ) : (
                '保存新密码'
              )}
            </button>
          </div>
        </div>

        {/* 应用更新 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔄</span>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">应用更新</h3>
          </div>

          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400 mb-4">
            <p>当前版本：<span className="font-mono text-gray-900 dark:text-white">{nativeVersion.version}</span> ({nativeVersion.platform})</p>
            {lastResult && !lastResult.hasUpdate && (
              <p className="text-green-600 dark:text-green-400 text-xs">✓ 已是最新版本</p>
            )}
            {lastResult?.fileSize && (
              <p className="text-xs">新版本大小：{formatBytes(lastResult.fileSize)}</p>
            )}
          </div>

          <button
            onClick={handleCheckUpdate}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors active:scale-95 disabled:opacity-50 text-base"
          >
            {checking ? (
              <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> 检查中...</>
            ) : '🔍 检查更新'}
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/update-admin')}
              className="w-full mt-2 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold rounded-xl transition-colors active:scale-95 text-base"
            >
              🛠️ 应用更新 - 管理后台
            </button>
          )}
        </div>

        {/* 内容管理 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📹</span>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">内容管理</h3>
          </div>
          <button
            onClick={gotoVideoManagement}
            className="w-full flex items-center justify-between p-3 sm:p-4 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-purple-600 shrink-0 text-xl">🗑️</span>
              <div className="text-left min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">视频管理</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {user.role === 'admin' ? '选择并删除任意视频' : '选择并删除你上传的视频'}
                </p>
              </div>
            </div>
            <span className="text-gray-400 shrink-0 ml-2">→</span>
          </button>
        </div>

        {/* 关于版本 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">📦</span>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">关于</h3>
          </div>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>应用名称：起飞塔</p>
            <p>版本号：{nativeVersion.version} ({nativeVersion.platform})</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">© 2025 起飞塔视频分享平台</p>
          </div>
        </div>

        {/* 退出登录按钮 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors active:scale-95 text-base shadow-sm"
        >
          🚪 退出登录
        </button>
      </main>

      {updateDialogData && (
        <UpdateDialog
          open={updateDialogOpen}
          onClose={() => setUpdateDialogOpen(false)}
          update={updateDialogData}
          currentVersion={nativeVersion.version}
        />
      )}
    </div>
  );
}
