import React, { useEffect, useState, useCallback } from 'react';
import {
  adminAuth,
  adminPublishVersion,
  adminDeleteVersion,
  adminListVersions,
  getDeviceId,
  formatBytes,
} from '../services/appUpdate';

// ============================================================
// 管理后台：应用更新管理
// 三道关卡：
//   1) 首次部署 → 首次部署向导（自动授权当前设备）
//   2) 管理密码（UPDATE_ADMIN_PASSWORD）
//   3) 设备 ID 白名单（app_update_devices 表）
//
// 功能：
//   - 发布新版本（APK/IPA URL + 版本号 + 更新日志 + 是否强制更新）
//   - 列出 / 删除历史版本
//   - 显示当前设备 ID（便于授权新设备时发给后台运维）
// ============================================================

const ADMIN_PASSWORD_HINT = '默认密码：updateAdmin888（可在后端 [[path]].ts 中修改）';

type View = 'login' | 'dashboard';

function Button({
  children, onClick, variant = 'primary', disabled, className = '', type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const base = 'px-4 py-2 rounded-lg font-medium text-sm transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 ${className}`}>{children}</div>
  );
}

function Field({
  label, children, hint, error,
}: {
  label: string; children: React.ReactNode; hint?: string; error?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// ============================================================
// 登录界面
// ============================================================

interface LoginProps {
  deviceId: string;
  deviceName: string;
  isFirstDeploy: boolean;
  onLoginSuccess: (password: string, deviceId: string) => void;
}

function LoginScreen({ deviceId, deviceName, isFirstDeploy, onLoginSuccess }: LoginProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [needDeviceAuth, setNeedDeviceAuth] = useState(false);

  const handleSubmit = async (isFirst: boolean) => {
    setError('');
    if (!password) { setError('请输入管理密码'); return; }
    setLoading(true);
    try {
      const result = await adminAuth(password, deviceId, deviceName, isFirst);
      if (result.success) {
        onLoginSuccess(password, deviceId);
      } else {
        setError(result.error || '认证失败');
        if (result.needDeviceAuth) setNeedDeviceAuth(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const isWebBrowser = !navigator.userAgent.includes('Capacitor') && !navigator.userAgent.includes('Android');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">🛠️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">应用更新 - 管理后台</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">密码 + 设备 ID 双因素认证</p>
        </div>

        {/* 浏览器端特殊提示 */}
        {isWebBrowser && (
          <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 mb-4">
            <div className="text-xs text-indigo-800 dark:text-indigo-200 leading-relaxed space-y-1">
              <div><span className="font-semibold">💻 浏览器访问说明：</span></div>
              <div>1. 输入下方「设备 ID」</div>
              <div>2. 打开 Cloudflare D1 数据库控制台，执行授权 SQL</div>
              <div className="font-mono bg-indigo-100 dark:bg-indigo-950 rounded px-2 py-1 text-[10px] break-all mt-1">
                INSERT INTO app_update_devices (id, deviceId, deviceName, grantedBy, grantedAt, isActive)<br />VALUES ('dev-browser', '{deviceId}', 'PC浏览器-{deviceName}', 'manual', datetime('now'), 1)
              </div>
              <div className="mt-1">3. 执行后返回此页面输入密码登录</div>
            </div>
          </div>
        )}

        {isFirstDeploy && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
            <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              <span className="font-semibold">⚠️ 首次使用提示：</span>
              当前数据库中没有授权设备。点击下方「授权当前设备并登录」，系统会自动将本设备加入白名单。
            </div>
          </div>
        )}

        {needDeviceAuth && !isFirstDeploy && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">
            <div className="text-xs text-red-800 dark:text-red-200 leading-relaxed">
              <span className="font-semibold">⚠️ 设备未授权：</span>
              当前设备不在白名单内。<br />
              请用浏览器打开管理后台页面，复制下方的「设备 ID」，然后在 Cloudflare D1 控制台执行授权 SQL。
            </div>
          </div>
        )}

        <Field label="管理密码" error={error}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入管理密码"
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
        </Field>

        <div className="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-3 mb-4">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
            <span>当前设备信息</span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">点击复制</span>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 break-all mb-1 font-mono bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-200 dark:border-gray-700 select-all"
               title="点击复制" onClick={() => { navigator.clipboard?.writeText(deviceId).catch(() => {}); }}>
            设备ID: {deviceId}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            设备名: {deviceName}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          {isFirstDeploy ? (
            <Button variant="primary" className="flex-1" disabled={loading} onClick={() => handleSubmit(true)}>
              {loading ? '处理中...' : '✅ 授权当前设备并登录'}
            </Button>
          ) : (
            <Button variant="primary" className="flex-1" disabled={loading} onClick={() => handleSubmit(false)}>
              {loading ? '登录中...' : '登录'}
            </Button>
          )}
        </div>

        <p className="text-[11px] text-center text-gray-400 dark:text-gray-500">{ADMIN_PASSWORD_HINT}</p>
      </Card>
    </div>
  );
}

// ============================================================
// 发布新版本表单
// ============================================================

interface PublishFormProps {
  password: string;
  deviceId: string;
  onPublished: () => void;
}

function PublishForm({ password, deviceId, onPublished }: PublishFormProps) {
  const [version, setVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isForce, setIsForce] = useState(false);
  const [platform, setPlatform] = useState('android');
  const [fileSize, setFileSize] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 上传本地文件到 API（走 /api/upload/form，返回文件 URL）
  const handleUploadFile = async () => {
    if (!file) {
      setMessage({ type: 'error', text: '请先选择文件' });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/form', { method: 'POST', body: formData });
      const data = await res.json();
      if (data?.url) {
        setUploadedUrl(data.url);
        setDownloadUrl(data.url);
        setFileSize(String(file.size));
        setMessage({ type: 'success', text: `上传成功: ${file.name}` });
      } else {
        setMessage({ type: 'error', text: data.error || '上传失败' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!version || !downloadUrl) {
      setMessage({ type: 'error', text: '版本号和下载地址必填' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await adminPublishVersion({ password, deviceId }, {
        version,
        downloadUrl,
        releaseNotes,
        isForce,
        platform,
        fileSize: Number(fileSize) || 0,
      });
      if (r.success) {
        setMessage({ type: 'success', text: `发布成功: ${version}` });
        // 重置
        setVersion(''); setDownloadUrl(''); setReleaseNotes(''); setIsForce(false);
        setFileSize(''); setFile(null); setUploadedUrl('');
        setTimeout(() => onPublished(), 800);
      } else {
        setMessage({ type: 'error', text: r.error || '发布失败' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">📤 发布新版本</h2>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field label="版本号 (如 1.2.3)">
            <input
              type="text" value={version} onChange={(e) => setVersion(e.target.value)}
              placeholder="例如 1.2.3"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              required
            />
          </Field>
          <Field label="平台">
            <select
              value={platform} onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            >
              <option value="android">Android (APK)</option>
              <option value="ios">iOS (IPA)</option>
            </select>
          </Field>
        </div>

        <Field label="下载地址 (URL)">
          <div className="flex gap-2">
            <input
              type="url" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://example.com/app-release.apk"
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              required
            />
          </div>
        </Field>

        <Field label="或上传本地文件（可选，走 /api/upload/form）">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="flex-1 text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:font-medium file:bg-blue-50 dark:file:bg-blue-900/40 file:text-blue-700 dark:file:text-blue-200 hover:file:bg-blue-100"
            />
            <Button variant="secondary" onClick={handleUploadFile} disabled={uploading || !file}>
              {uploading ? '上传中...' : '上传并填入'}
            </Button>
          </div>
          {uploadedUrl && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 break-all">
              ✓ 已填入: {uploadedUrl}
            </p>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field label="文件大小 (字节，可选)">
            <input
              type="number" value={fileSize} onChange={(e) => setFileSize(e.target.value)}
              placeholder="0"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </Field>
          <Field label="更新类型">
            <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 cursor-pointer">
              <input
                type="checkbox" checked={isForce} onChange={(e) => setIsForce(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-900 dark:text-white">
                {isForce ? '强制更新 (用户必须安装)' : '可选更新 (用户可稍后提醒)'}
              </span>
            </label>
          </Field>
        </div>

        <Field label="更新日志">
          <textarea
            value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)}
            rows={5}
            placeholder={'1. 修复 XXX 问题\n2. 新增 XXX 功能\n3. 优化 XXX'}
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm leading-relaxed"
          />
        </Field>

        {message && (
          <div className={`rounded-lg px-3 py-2 mb-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? '发布中...' : '🚀 发布此版本'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ============================================================
// 版本列表
// ============================================================

interface VersionListProps {
  password: string;
  deviceId: string;
  refreshKey: number;
}

function VersionList({ password, deviceId, refreshKey }: VersionListProps) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('android');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListVersions({ password, deviceId }, platform);
      setVersions(data);
    } finally {
      setLoading(false);
    }
  }, [password, deviceId, platform, refreshKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该版本？此操作不可撤销')) return;
    await adminDeleteVersion({ password, deviceId }, id);
    await loadData();
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">📋 历史版本</h2>
        <div className="flex items-center gap-2">
          <select
            value={platform} onChange={(e) => setPlatform(e.target.value)}
            className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          >
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </select>
          <Button variant="secondary" onClick={loadData}>刷新</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">加载中...</div>
      ) : versions.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">暂无版本记录</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 px-2 font-medium">版本</th>
                <th className="py-2 px-2 font-medium">大小</th>
                <th className="py-2 px-2 font-medium">类型</th>
                <th className="py-2 px-2 font-medium">发布时间</th>
                <th className="py-2 px-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v: any) => (
                <tr key={v.id || v.version} className="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-900/40">
                  <td className="py-3 px-2">
                    <div className="font-medium text-gray-900 dark:text-white">{v.version}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 break-all max-w-xs">{v.downloadUrl}</div>
                  </td>
                  <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{formatBytes(v.fileSize || 0)}</td>
                  <td className="py-3 px-2">
                    {v.isForce ? (
                      <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">强制</span>
                    ) : (
                      <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">可选</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-xs text-gray-600 dark:text-gray-400">
                    {String(v.publishedAt || '-').slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="py-3 px-2">
                    <Button variant="danger" onClick={() => handleDelete(String(v.id))}>删除</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// 管理后台：主组件
// ============================================================

export default function UpdateAdmin() {
  const [view, setView] = useState<View>('login');
  const [creds, setCreds] = useState<{ password: string; deviceId: string } | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId: string; deviceName: string }>({
    deviceId: '', deviceName: '',
  });
  const [isFirstDeploy, setIsFirstDeploy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      const info = await getDeviceId();
      setDeviceInfo({ deviceId: info.deviceId, deviceName: info.deviceName });
      // 简单策略：本地没有标记时，尝试检测是否首次部署（失败则默认 true，让用户勾选）
      // 真实逻辑在后端，这里只是给用户一个"更智能"的默认值
      const done = localStorage.getItem('__UPDATE_ADMIN_INIT__');
      setIsFirstDeploy(!done);
    })();
  }, []);

  const handleLogin = (password: string, deviceId: string) => {
    setCreds({ password, deviceId });
    setView('dashboard');
    localStorage.setItem('__UPDATE_ADMIN_INIT__', '1');
  };

  if (view === 'login' || !creds) {
    return (
      <LoginScreen
        deviceId={deviceInfo.deviceId}
        deviceName={deviceInfo.deviceName}
        isFirstDeploy={isFirstDeploy}
        onLoginSuccess={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">应用更新管理后台</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              当前设备: <span className="font-mono text-xs">{deviceInfo.deviceId}</span>
            </p>
          </div>
          <Button variant="ghost" onClick={() => setView('login')}>退出登录</Button>
        </div>

        <div className="space-y-6">
          <PublishForm
            password={creds.password}
            deviceId={creds.deviceId}
            onPublished={() => setRefreshKey((k) => k + 1)}
          />
          <VersionList
            password={creds.password}
            deviceId={creds.deviceId}
            refreshKey={refreshKey}
          />
        </div>
      </div>
    </div>
  );
}
