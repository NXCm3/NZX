import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkUpdate,
  getNativeVersion,
  downloadApk,
  installApk,
  cancelDownload,
  formatBytes,
  isNative,
  type UpdateCheckResponse,
  type DownloadProgressEvent,
} from '../services/appUpdate';

// ============================================================
// 通用按钮（保持与项目一致的 UI 风格）
// ============================================================
function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
}) {
  const base =
    'px-5 py-2.5 rounded-lg font-medium text-sm transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

// ============================================================
// 更新对话框组件（客户端检测 + 下载 + 安装）
// ============================================================

interface UpdateDialogProps {
  open: boolean;
  onClose?: () => void;
  update: UpdateCheckResponse;
  currentVersion: string;
}

function UpdateDialog({ open, onClose, update, currentVersion }: UpdateDialogProps) {
  const [stage, setStage] = useState<'prompt' | 'downloading' | 'ready' | 'error'>('prompt');
  const [progress, setProgress] = useState(0);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [filePath, setFilePath] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (open) {
      setStage('prompt');
      setProgress(0);
      setBytesDownloaded(0);
      setBytesTotal(0);
      setFilePath('');
      setErrorMsg('');
    }
  }, [open]);

  const isForce = Boolean(update.isForce);

  const handleStartDownload = useCallback(async () => {
    if (!update.downloadUrl) {
      setErrorMsg('下载地址无效');
      setStage('error');
      return;
    }
    setStage('downloading');
    setProgress(0);
    try {
      const filename = `update-${update.latestVersion || 'latest'}.apk`;
      const path = await downloadApk(
        update.downloadUrl,
        filename,
        (evt: DownloadProgressEvent) => {
          setProgress(Math.min(100, Math.max(0, Number(evt.percent) || 0)));
          setBytesDownloaded(evt.bytesDownloaded || 0);
          setBytesTotal(evt.bytesTotal || update.fileSize || 0);
        }
      );
      setFilePath(path);
      setStage('ready');
    } catch (e: any) {
      setErrorMsg(e?.message || '下载失败');
      setStage('error');
    }
  }, [update]);

  const handleInstall = useCallback(async () => {
    if (!filePath) return;
    try {
      const r = await installApk(filePath);
      if (r.needPermission) {
        alert(r.message || '请在系统设置中开启应用安装权限后重试');
      } else if (!r.success) {
        setErrorMsg(r.message || '安装失败');
        setStage('error');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || '安装失败');
      setStage('error');
    }
  }, [filePath]);

  const handleCancel = useCallback(async () => {
    if (stage === 'downloading') {
      await cancelDownload();
    }
    onClose?.();
  }, [stage, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center shrink-0">
              <span className="text-2xl">🔔</span>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">发现新版本</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                当前版本 {currentVersion} → 最新版本 {update.latestVersion || '-'}
                {update.fileSize ? ` ( ${formatBytes(update.fileSize)} )` : ''}
              </p>
            </div>
            {!isForce && (
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
                aria-label="关闭"
              >
                ×
              </button>
            )}
          </div>

          {update.releaseNotes ? (
            <div className="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">更新内容</div>
              <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">
                {update.releaseNotes}
              </pre>
            </div>
          ) : null}

          {isForce && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-3">
              <div className="text-xs text-red-700 dark:text-red-300 font-medium">
                ⚠️ 此版本为强制更新，必须安装后才能继续使用
              </div>
            </div>
          )}

          {stage === 'downloading' && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 mb-2">
                <span>正在下载... {progress}%</span>
                <span>{formatBytes(bytesDownloaded)} / {formatBytes(bytesTotal || update.fileSize || 0)}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {stage === 'ready' && (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2 mb-3">
              <div className="text-xs text-green-700 dark:text-green-300 font-medium">
                ✓ 下载完成，点击下方按钮立即安装
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-3">
              <div className="text-xs text-red-700 dark:text-red-300 font-medium">❌ {errorMsg}</div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-2">
          {stage === 'prompt' && (
            <>
              {!isForce && (
                <Button variant="secondary" className="flex-1" onClick={handleCancel}>稍后提醒</Button>
              )}
              <Button variant="primary" className="flex-1" onClick={handleStartDownload}>立即更新</Button>
            </>
          )}
          {stage === 'downloading' && (
            <>
              {!isForce && (
                <Button variant="secondary" className="flex-1" onClick={handleCancel}>取消下载</Button>
              )}
              <Button variant="primary" className="flex-1" disabled>下载中...</Button>
            </>
          )}
          {stage === 'ready' && (
            <Button variant="primary" className="flex-1" onClick={handleInstall}>立即安装</Button>
          )}
          {stage === 'error' && (
            <>
              {!isForce && (
                <Button variant="secondary" className="flex-1" onClick={handleCancel}>稍后提醒</Button>
              )}
              <Button variant="primary" className="flex-1" onClick={handleStartDownload}>重新下载</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主页面：集成版本检测与 UI
//   - onUpdateAvailable(newUpdate) : 检测到更新时回调，可用于 App.tsx 展示对话框
//   - silent=false 时会弹出内部对话框
// ============================================================

interface AppUpdateManagerProps {
  checkOnMount?: boolean;
  onUpdateAvailable?: (update: UpdateCheckResponse, currentVersion: string) => void;
  showInternalDialog?: boolean;
}

export function AppUpdateManager({
  checkOnMount = true,
  onUpdateAvailable,
  showInternalDialog = true,
}: AppUpdateManagerProps) {
  const [update, setUpdate] = useState<UpdateCheckResponse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('0.0.0');

  useEffect(() => {
    if (!checkOnMount) return;
    let cancelled = false;

    (async () => {
      try {
        console.log('[更新检测] 开始检查新版本...');
        const native = await getNativeVersion();
        if (cancelled) return;
        setCurrentVersion(native.version);
        console.log('[更新检测] 本地版本:', native.version, '平台:', native.platform);

        const result = await checkUpdate(native.version, native.platform);
        if (cancelled) return;
        console.log('[更新检测] 服务器返回:', JSON.stringify(result));

        if (result.hasUpdate) {
          console.log('[更新检测] ✅ 发现新版本:', result.latestVersion);
          setUpdate(result);
          if (showInternalDialog) {
            setTimeout(() => setDialogOpen(true), 800);
          }
          onUpdateAvailable?.(result, native.version);
        } else {
          console.log('[更新检测] 当前已是最新版本');
        }
      } catch (err: any) {
        console.log('[更新检测] ❌ 检查失败:', err?.message || err);
      }
    })();

    return () => { cancelled = true; };
  }, [checkOnMount, showInternalDialog, onUpdateAvailable]);

  if (!update || !showInternalDialog) return null;
  return (
    <UpdateDialog
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      update={update}
      currentVersion={currentVersion}
    />
  );
}

// ============================================================
// 手动触发一次检测（供设置页的"检查更新"按钮使用）
// ============================================================

export function useManualUpdateCheck() {
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<UpdateCheckResponse | null>(null);
  const [currentVersion, setCurrentVersion] = useState('0.0.0');

  const runCheck = useCallback(async (): Promise<UpdateCheckResponse> => {
    setChecking(true);
    try {
      const native = await getNativeVersion();
      setCurrentVersion(native.version);
      const result = await checkUpdate(native.version, native.platform);
      setLastResult(result);
      return result;
    } finally {
      setChecking(false);
    }
  }, []);

  return { checking, lastResult, currentVersion, runCheck };
}

export { UpdateDialog };
export const updateEnvironment = { isNative };
