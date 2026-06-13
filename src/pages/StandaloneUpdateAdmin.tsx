import React, { useState, useEffect, useCallback } from 'react';

// ============================================================
// 独立管理后台 - 可直接从浏览器打开
// 访问地址: https://你的域名/update-admin-web
//
// 功能：
//   - 发布新版本（APK/IPA URL + 版本号 + 更新日志 + 是否强制更新）
//   - 列出 / 删除历史版本
//   - 获取当前设备 ID（复制后用于授权）
//
// 访问流程：
//   1. 打开此页面，记录显示的「浏览器设备ID」
//   2. 在 Cloudflare D1 控制台执行授权 SQL
//   3. 返回此页面输入密码登录
// ============================================================

const API_BASE = 'https://nzx-5o4.pages.dev/api';
const ADMIN_PASSWORD = 'updateAdmin888';

interface VersionInfo {
  id: string;
  version: string;
  versionCode: number;
  downloadUrl: string;
  fileSize: number;
  releaseNotes: string;
  isForce: number;
  platform: string;
  publishedAt: string;
  publishedBy: string;
  checksum: string;
}

// 生成浏览器端设备 ID（基于屏幕分辨率 + 语言 + 时区 + 随机数）
function generateBrowserDeviceId(): string {
  const raw = [
    screen.width, screen.height, screen.colorDepth,
    navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset(),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const id = 'web-' + Math.abs(hash).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  // 持久化
  try { localStorage.setItem('__BROWSER_DEVICE_ID__', id); } catch {}
  return id;
}

function getBrowserDeviceId(): string {
  try {
    const stored = localStorage.getItem('__BROWSER_DEVICE_ID__');
    if (stored) return stored;
  } catch {}
  return generateBrowserDeviceId();
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  return iso.slice(0, 19).replace('T', ' ');
}

async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

function Button({ children, onClick, variant = 'primary', disabled, className = '' }: any) {
  const base = 'px-4 py-2.5 rounded-lg font-medium text-sm transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Card({ children, className = '' }: any) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 ${className}`}>{children}</div>
  );
}

// ============================================================
// 主页面
// ============================================================
export default function StandaloneUpdateAdmin() {
  const [deviceId] = useState(getBrowserDeviceId);
  const [password, setPassword] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  // 版本列表
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // 发布表单
  const [publishForm, setPublishForm] = useState({
    version: '', downloadUrl: '', releaseNotes: '', isForce: false, platform: 'android', fileSize: '',
  });
  const [publishMsg, setPublishMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  // 文件上传
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // ============================================================
  // 认证
  // ============================================================
  const handleLogin = async () => {
    if (!password) { setAuthError('请输入管理密码'); return; }
    setLoading(true);
    setAuthError('');
    try {
      const data: any = await apiPost('/app-updates/admin-auth', { password, deviceId });
      if (data.success) {
        setIsAuthed(true);
        loadVersions();
      } else {
        setAuthError(data.error || '认证失败');
      }
    } catch (e: any) {
      setAuthError(e.message || '网络错误，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 加载版本列表
  // ============================================================
  const loadVersions = useCallback(async () => {
    setListLoading(true);
    try {
      const data: any = await apiPost('/app-updates/list', { password, deviceId, platform: 'android' });
      setVersions(Array.isArray(data) ? data : []);
    } catch {
      setVersions([]);
    } finally {
      setListLoading(false);
    }
  }, [password, deviceId]);

  // ============================================================
  // 上传文件
  // ============================================================
  const handleUploadFile = async () => {
    if (!file) return;
    setUploading(true);
    setPublishMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/upload/form`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data?.url) {
        setPublishForm(f => ({ ...f, downloadUrl: data.url, fileSize: String(file.size) }));
        setPublishMsg({ type: 'success', text: `上传成功: ${data.url}` });
      } else {
        setPublishMsg({ type: 'error', text: data.error || '上传失败' });
      }
    } catch (e: any) {
      setPublishMsg({ type: 'error', text: e.message || '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  // ============================================================
  // 发布版本
  // ============================================================
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishForm.version || !publishForm.downloadUrl) {
      setPublishMsg({ type: 'error', text: '版本号和下载地址不能为空' });
      return;
    }
    setPublishing(true);
    setPublishMsg(null);
    try {
      const data: any = await apiPost('/app-updates/publish', {
        password, deviceId,
        version: publishForm.version,
        downloadUrl: publishForm.downloadUrl,
        releaseNotes: publishForm.releaseNotes,
        isForce: publishForm.isForce,
        platform: publishForm.platform,
        fileSize: Number(publishForm.fileSize) || 0,
      });
      if (data.success) {
        setPublishMsg({ type: 'success', text: `✅ 发布成功: v${publishForm.version}` });
        setPublishForm({ version: '', downloadUrl: '', releaseNotes: '', isForce: false, platform: 'android', fileSize: '' });
        setFile(null);
        setTimeout(() => loadVersions(), 500);
      } else {
        setPublishMsg({ type: 'error', text: data.error || '发布失败' });
      }
    } catch (e: any) {
      setPublishMsg({ type: 'error', text: e.message || '发布失败' });
    } finally {
      setPublishing(false);
    }
  };

  // ============================================================
  // 删除版本
  // ============================================================
  const handleDelete = async (id: string, version: string) => {
    if (!confirm(`确认删除版本 v${version}？此操作不可撤销。`)) return;
    try {
      const data: any = await apiPost('/app-updates/delete', { password, deviceId, id });
      if (data.success) {
        setVersions(v => v.filter(x => x.id !== id));
      } else {
        alert(data.error || '删除失败');
      }
    } catch (e: any) {
      alert(e.message || '删除失败');
    }
  };

  const copyDeviceId = () => {
    navigator.clipboard?.writeText(deviceId).then(() => {
      alert(`设备 ID 已复制: ${deviceId}`);
    }).catch(() => {
      prompt('请手动复制设备 ID:', deviceId);
    });
  };

  // ============================================================
  // 渲染：未登录
  // ============================================================
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🛠️</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">应用更新管理后台</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">起飞塔 · 版本发布管理</p>
          </div>

          <Card>
            <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 mb-6">
              <div className="text-sm text-indigo-900 dark:text-indigo-100 space-y-2">
                <div className="font-semibold flex items-center gap-2"><span>💻</span> 首次访问 / 授权设备</div>
                <div className="text-xs leading-relaxed opacity-90">
                  1. 点击下方按钮复制「浏览器设备ID」<br />
                  2. 打开 Cloudflare D1 数据库控制台<br />
                  3. 执行以下 SQL 授权此浏览器：
                </div>
                <div
                  className="bg-white/60 dark:bg-gray-900/60 rounded px-3 py-2 font-mono text-[11px] break-all cursor-pointer hover:bg-white/80 dark:hover:bg-gray-900/80 transition-colors"
                  onClick={copyDeviceId}
                  title="点击复制整段 SQL"
                >
                  INSERT INTO app_update_devices<br />
                  &nbsp;(id, deviceId, deviceName, grantedBy, grantedAt, isActive)<br />
                  &nbsp;VALUES (<br />
                  &nbsp;&nbsp;'dev-browser',<br />
                  &nbsp;&nbsp;'{deviceId}',<br />
                  &nbsp;&nbsp;'PC浏览器管理后台',<br />
                  &nbsp;&nbsp;'manual',<br />
                  &nbsp;&nbsp;datetime('now'),<br />
                  &nbsp;&nbsp;1<br />
                  &nbsp;);
                </div>
                <div className="text-xs opacity-80">4. 授权后输入密码登录</div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">管理密码</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="请输入管理密码"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {authError && (
                <p className="text-red-600 dark:text-red-400 text-xs mt-2">{authError}</p>
              )}
            </div>

            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">当前浏览器设备ID</div>
              <div
                className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={copyDeviceId}
                title="点击复制"
              >
                {deviceId}
              </div>
            </div>

            <Button className="w-full" disabled={loading} onClick={handleLogin}>
              {loading ? '登录中...' : '登录管理后台'}
            </Button>
            <p className="text-[11px] text-center text-gray-400 mt-3">默认密码：updateAdmin888</p>
          </Card>

          <div className="text-center mt-6 text-xs text-gray-400 dark:text-gray-500">
            <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer"
               className="underline hover:text-gray-600">
              打开 Cloudflare D1 控制台 →
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 渲染：已登录 - 管理面板
  // ============================================================
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🛠️ 应用更新管理后台</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              起飞塔 · 版本发布系统
            </p>
          </div>
          <Button variant="ghost" onClick={() => { setIsAuthed(false); setPassword(''); }}>退出登录</Button>
        </div>

        {/* 发布新版本 */}
        <Card>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
            <span>📤</span> 发布新版本
          </h2>
          <form onSubmit={handlePublish}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">版本号 *</label>
                <input
                  type="text" value={publishForm.version} onChange={e => setPublishForm(f => ({ ...f, version: e.target.value }))}
                  placeholder="例如 1.2.3 或 2025.06.12"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">平台</label>
                <select
                  value={publishForm.platform}
                  onChange={e => setPublishForm(f => ({ ...f, platform: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="android">Android (APK)</option>
                  <option value="ios">iOS (IPA)</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">下载地址 *</label>
              <input
                type="url" value={publishForm.downloadUrl}
                onChange={e => setPublishForm(f => ({ ...f, downloadUrl: e.target.value }))}
                placeholder="https://example.com/app-release.apk"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">上传本地文件（可选，上传后自动填入下载地址）</label>
              <div className="flex gap-2">
                <input
                  type="file" accept=".apk,.ipa"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="flex-1 text-sm file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <Button variant="secondary" type="button" disabled={!file || uploading} onClick={handleUploadFile}>
                  {uploading ? '上传中...' : '上传'}
                </Button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">更新日志</label>
              <textarea
                value={publishForm.releaseNotes}
                onChange={e => setPublishForm(f => ({ ...f, releaseNotes: e.target.value }))}
                rows={5}
                placeholder={'1. 修复了视频播放卡顿问题\n2. 新增了 160P 低画质选项\n3. 优化了深色模式主题'}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
              />
            </div>

            <div className="mb-5 flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={publishForm.isForce}
                  onChange={e => setPublishForm(f => ({ ...f, isForce: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {publishForm.isForce ? '🔴 强制更新（用户必须安装）' : '🔵 可选更新（用户可稍后提醒）'}
                </span>
              </label>
            </div>

            {publishMsg && (
              <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                publishMsg.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}>
                {publishMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={publishing}>
                {publishing ? '发布中...' : '🚀 发布此版本'}
              </Button>
            </div>
          </form>
        </Card>

        {/* 历史版本列表 */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>📋</span> 历史版本
            </h2>
            <Button variant="secondary" onClick={loadVersions} disabled={listLoading}>
              {listLoading ? '加载中...' : '🔄 刷新'}
            </Button>
          </div>

          {listLoading ? (
            <div className="text-center py-10 text-gray-500">加载中...</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">暂无版本记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2.5 px-2 font-medium">版本</th>
                    <th className="py-2.5 px-2 font-medium">大小</th>
                    <th className="py-2.5 px-2 font-medium">类型</th>
                    <th className="py-2.5 px-2 font-medium">发布时间</th>
                    <th className="py-2.5 px-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map(v => (
                    <tr key={v.id} className="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-900/40">
                      <td className="py-3 px-2">
                        <div className="font-semibold text-gray-900 dark:text-white">v{v.version}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 break-all max-w-sm mt-0.5">{v.downloadUrl}</div>
                        {v.releaseNotes && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">{v.releaseNotes}</div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{formatBytes(v.fileSize)}</td>
                      <td className="py-3 px-2">
                        {v.isForce ? (
                          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">强制</span>
                        ) : (
                          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">可选</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-xs text-gray-600 dark:text-gray-400">{formatDate(v.publishedAt)}</td>
                      <td className="py-3 px-2">
                        <Button variant="danger" onClick={() => handleDelete(v.id, v.version)}>删除</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 底部 */}
        <div className="text-center text-xs text-gray-400 dark:text-gray-500">
          起飞塔应用更新管理后台 · Powered by Cloudflare Workers + D1
        </div>
      </div>
    </div>
  );
}
