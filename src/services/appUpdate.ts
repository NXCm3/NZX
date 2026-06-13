// 应用更新 - 前端桥接模块
// 对接后端 /api/app-updates/* 和 Capacitor 原生插件 AppUpdate
//
// 功能清单：
//   1. 检测服务器最新版本 (checkUpdate)
//   2. 调用原生插件获取当前版本 (getNativeVersion)
//   3. 获取设备唯一 ID (getDeviceId) - 用于管理终端设备白名单
//   4. 下载 APK 并监听进度 (downloadApk)
//   5. 安装 APK (installApk)
//   6. 管理后台：认证/发布/删除/列表 (adminAuth/publish/list/delete)

import { api } from './api';

// ============================================================
// 类型定义
// ============================================================

export interface UpdateCheckRequest {
  currentVersion: string;
  platform?: string;
}

export interface UpdateCheckResponse {
  hasUpdate: boolean;
  latestVersion?: string;
  versionCode?: number;
  downloadUrl?: string;
  releaseNotes?: string;
  isForce?: boolean;
  fileSize?: number;
  checksum?: string;
  platform?: string;
  publishedAt?: string;
  message?: string;
}

export interface NativeVersionInfo {
  version: string;
  versionCode: number;
  packageName: string;
  platform: string;
}

export interface DeviceIdInfo {
  deviceId: string;
  deviceName: string;
  androidVersion?: string;
  sdkInt?: number;
  error?: string;
}

export interface DownloadProgressEvent {
  downloadId: number;
  status: number;
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
}

export interface DownloadCompleteEvent {
  status: string;
  filePath: string;
  uri: string;
  message: string;
}

// ============================================================
// Capacitor 桥接
// ============================================================

/**
 * ⏱️ 等待 Capacitor 桥接就绪（最多等待 5 秒）
 * 问题：APK 启动时，React 渲染和 Capacitor 原生桥接是并行异步的。
 *       如果 getNativeVersion() 在桥接就绪前被调用，就会读到空的 Plugins。
 */
function waitForCapacitor(timeoutMs: number = 5000): Promise<any> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const cap: any = (window as any).Capacitor;
      if (cap && cap.Plugins) {
        resolve(cap);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(cap || null);
        return;
      }
      setTimeout(check, 100); // 每 100ms 轮询一次
    };
    check();
  });
}

function getCapacitorPlugin(name: string): any {
  try {
    const cap: any = (window as any).Capacitor;
    if (!cap || !cap.Plugins) return null;
    return cap.Plugins[name] || null;
  } catch (e) {
    return null;
  }
}

function isCapacitorAvailable(): boolean {
  return !!getCapacitorPlugin('App');
}

/**
 * 获取原生应用版本（APK 内运行时有效）
 * 浏览器环境下返回基于 version.ts 的假信息
 */
export async function getNativeVersion(): Promise<NativeVersionInfo> {
  // 先等 Capacitor 桥接就绪（解决"React 渲染比桥接快"的时序问题）
  const cap = await waitForCapacitor(3000);
  const inAPK = !!(cap && cap.Plugins);

  // 诊断：打印所有可用插件名
  let pluginNames: string[] = [];
  if (cap && cap.Plugins) {
    pluginNames = Object.keys(cap.Plugins);
  }
  console.log('[AppUpdate] ✅ Capacitor 就绪:', inAPK ? 'YES' : 'NO', '(等待后)');
  console.log('[AppUpdate] 📋 所有可用插件:', pluginNames.join(', ') || '(空)');

  // === 方案 1：尝试我们自己的 AppUpdate 插件 (最准确)
  const appUpdate = cap?.Plugins?.AppUpdate;
  if (appUpdate && typeof appUpdate.getCurrentVersion === 'function') {
    try {
      console.log('[AppUpdate] 方案1: AppUpdate.getCurrentVersion()');
      const ret: any = await appUpdate.getCurrentVersion();
      console.log('[AppUpdate]   → 返回:', JSON.stringify(ret));
      const version = ret.version || ret.versionName || '';
      const versionCode = Number(ret.versionCode || ret.build || 0);
      if (version && versionCode > 0 && version !== '0.0.0') {
        return {
          version,
          versionCode,
          packageName: ret.packageName || 'com.nzx.video',
          platform: ret.platform || 'android',
        };
      }
    } catch (e: any) {
      console.warn('[AppUpdate]   → 异常:', e?.message || e);
    }
  }

  // === 方案 2：尝试 Capacitor 内置 App.getInfo() (最可靠)
  const appPlugin = cap?.Plugins?.App;
  if (appPlugin && typeof appPlugin.getInfo === 'function') {
    try {
      console.log('[AppUpdate] 方案2: App.getInfo()');
      const ret: any = await appPlugin.getInfo();
      console.log('[AppUpdate]   → 返回:', JSON.stringify(ret));
      const version = ret.version || ret.versionName || '';
      const buildStr = String(ret.build || ret.versionCode || '1');
      if (version) {
        return {
          version,
          versionCode: parseInt(buildStr, 10) || 1,
          packageName: ret.id || ret.packageName || 'com.nzx.video',
          platform: 'android',
        };
      }
    } catch (e: any) {
      console.warn('[AppUpdate]   → 异常:', e?.message || e);
    }
  }

  // === 方案 2.5：检查原生层直接注入的 window.__APP_INFO__ (最最可靠)
  try {
    const injected: any = (window as any).__APP_INFO__;
    if (injected && injected.version) {
      console.log('[AppUpdate] 方案2.5: window.__APP_INFO__ =', JSON.stringify(injected));
      return {
        version: String(injected.version),
        versionCode: Number(injected.versionCode) || 1,
        packageName: String(injected.packageName || 'com.nzx.video'),
        platform: String(injected.platform || 'android'),
      };
    }
  } catch (e) {
    console.warn('[AppUpdate]   → window.__APP_INFO__ 读取异常:', e);
  }

  // === 方案 3：兜底：Capacitor 环境 (在 APK 中必然存在)
  if (inAPK) {
    console.log('[AppUpdate] 方案3: 兜底硬编码 1.0.1');
    return {
      version: '1.0.1',
      versionCode: 2,
      packageName: 'com.nzx.video',
      platform: 'android',
    };
  }

  // === 方案 4：浏览器环境
  console.log('[AppUpdate] 方案4: 浏览器环境，返回 0.0.0 (web)');
  return {
    version: '0.0.0',
    versionCode: 1,
    packageName: 'com.nzx.video',
    platform: 'web',
  };
}

/**
 * 获取设备 ID（用于管理终端设备白名单）
 * 浏览器环境下自动生成随机 ID 并存储到 localStorage
 */
export async function getDeviceId(): Promise<DeviceIdInfo> {
  const plugin = getCapacitorPlugin('AppUpdate');
  if (plugin && typeof plugin.getDeviceId === 'function') {
    try {
      const ret: any = await plugin.getDeviceId();
      return {
        deviceId: ret.deviceId,
        deviceName: ret.deviceName,
        androidVersion: ret.androidVersion,
        sdkInt: ret.sdkInt,
        error: ret.error,
      };
    } catch (e: any) {
      console.warn('[AppUpdate] 设备ID获取失败:', e);
    }
  }
  // 浏览器降级：读取 / 生成持久 ID
  let id = '';
  try {
    id = localStorage.getItem('__DEVICE_ID__') || '';
  } catch (e) { /* ignore */ }
  if (!id) {
    id = 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem('__DEVICE_ID__', id); } catch (e) { /* ignore */ }
  }
  return {
    deviceId: id,
    deviceName: navigator.userAgent.slice(0, 40),
    androidVersion: undefined,
    sdkInt: undefined,
  };
}

/**
 * 下载 APK（仅在原生环境有效）
 * 参数：
 *   url       - APK 下载地址
 *   filename  - 文件名(可选)
 *   onProgress - 进度回调 (0-100)
 * 返回：
 *   filePath  - 下载完成后 APK 的本地路径
 */
export async function downloadApk(
  url: string,
  filename?: string,
  onProgress?: (progress: DownloadProgressEvent) => void
): Promise<string> {
  const plugin = getCapacitorPlugin('AppUpdate');
  if (!plugin || typeof plugin.downloadApk !== 'function') {
    throw new Error('当前环境不支持原生下载（仅 Android APK 支持）');
  }

  // 注册进度事件监听
  let removeListener: (() => void) | null = null;
  try {
    if (typeof plugin.addListener === 'function') {
      const handler = await plugin.addListener('downloadProgress', (evt: DownloadProgressEvent) => {
        if (onProgress) onProgress(evt);
      });
      removeListener = typeof handler.remove === 'function' ? handler.remove : (typeof handler === 'function' ? handler : null);
    }
  } catch (e) { /* ignore listener failure */ }

  try {
    const ret: any = await plugin.downloadApk({ url, filename });
    if (ret && ret.filePath) return String(ret.filePath);
    if (ret && ret.uri) return String(ret.uri).replace(/^file:\/\//, '');
    throw new Error(ret?.message || '下载失败');
  } finally {
    if (removeListener) { try { removeListener(); } catch (e) { /* ignore */ } }
  }
}

/**
 * 安装 APK（仅在原生环境有效）
 */
export async function installApk(filePath: string): Promise<{ success: boolean; needPermission?: boolean; message?: string }> {
  const plugin = getCapacitorPlugin('AppUpdate');
  if (!plugin || typeof plugin.installApk !== 'function') {
    throw new Error('当前环境不支持原生安装（仅 Android APK 支持）');
  }
  const ret: any = await plugin.installApk({ filePath });
  return {
    success: Boolean(ret.success),
    needPermission: Boolean(ret.needPermission),
    message: ret.message,
  };
}

/**
 * 取消当前下载
 */
export async function cancelDownload(): Promise<boolean> {
  const plugin = getCapacitorPlugin('AppUpdate');
  if (!plugin || typeof plugin.cancelDownload !== 'function') return false;
  try {
    const ret: any = await plugin.cancelDownload();
    return Boolean(ret?.success);
  } catch (e) { return false; }
}

// ============================================================
// 后端 API
// ============================================================

/**
 * 检查更新 - 传入本地版本号
 * 🔴 调试模式：输出完整请求和响应到 console
 */
export async function checkUpdate(currentVersion: string, platform = 'android'): Promise<UpdateCheckResponse> {
  console.log('%c[AppUpdate] ===== 检查更新请求 =====', 'color:#2563eb;font-weight:bold;');
  console.log('[AppUpdate] currentVersion:', currentVersion);
  console.log('[AppUpdate] platform:', platform);

  try {
    const data = await api.post<UpdateCheckResponse>('/app-updates/check', {
      currentVersion,
      platform,
    });
    console.log('%c[AppUpdate] 服务器返回:', 'color:#16a34a;font-weight:bold;', JSON.stringify(data, null, 2));
    // 🔴 强制转换为布尔值，防止 hasUpdate 为 0/1/null
    if (data && typeof data.hasUpdate !== 'undefined') {
      data.hasUpdate = Boolean(data.hasUpdate);
    }
    console.log('[AppUpdate] 最终 hasUpdate:', data?.hasUpdate);
    return data;
  } catch (e: any) {
    console.error('[AppUpdate] 检查更新失败:', e);
    return {
      hasUpdate: false,
      message: e.message || '检测更新失败',
    };
  }
}

/**
 * 管理后台 - 密码 + 设备 ID 双因素认证
 * isFirst=true 时表示首次部署，将当前设备加入白名单
 */
export async function adminAuth(
  password: string,
  deviceId: string,
  deviceName: string = '',
  isFirst: boolean = false
): Promise<{ success: boolean; message?: string; deviceId?: string; token?: string; needDeviceAuth?: boolean; error?: string }> {
  try {
    const body: any = { password, deviceId };
    if (deviceName) body.deviceName = deviceName;
    if (isFirst) body.isFirst = '1';
    const data = await api.post<any>('/app-updates/admin-auth', body);
    // 如果返回 status=200 但 error 字段有内容，也算是失败
    if (data && data.error) {
      return { success: false, error: data.error, needDeviceAuth: data.needDeviceAuth, deviceId: data.deviceId };
    }
    return { success: true, ...data };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || '认证失败',
    };
  }
}

/**
 * 管理后台 - 发布新版本
 */
export async function adminPublishVersion(
  creds: { password: string; deviceId: string },
  params: {
    version: string;
    versionCode?: number;
    downloadUrl: string;
    fileSize?: number;
    releaseNotes: string;
    isForce: boolean;
    platform?: string;
    checksum?: string;
  }
): Promise<{ success: boolean; message?: string; version?: string; error?: string }> {
  try {
    const data = await api.post<any>('/app-updates/publish', {
      ...creds,
      ...params,
    });
    if (data && data.error) return { success: false, error: data.error };
    return { success: true, ...data };
  } catch (e: any) {
    return { success: false, error: e.message || '发布失败' };
  }
}

/**
 * 管理后台 - 删除历史版本
 */
export async function adminDeleteVersion(
  creds: { password: string; deviceId: string },
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const data = await api.post<any>('/app-updates/delete', { ...creds, id });
    if (data && data.error) return { success: false, error: data.error };
    return { success: true, ...data };
  } catch (e: any) {
    return { success: false, error: e.message || '删除失败' };
  }
}

/**
 * 管理后台 - 历史版本列表
 */
export async function adminListVersions(
  creds: { password: string; deviceId: string },
  platform = 'android'
): Promise<any[]> {
  try {
    const data = await api.post<any>('/app-updates/list', { ...creds, platform });
    if (Array.isArray(data)) return data;
    // 兼容 { results: [...] } 形式
    if (data && Array.isArray((data as any).results)) return (data as any).results;
    return [];
  } catch (e) {
    return [];
  }
}

// ============================================================
// 辅助
// ============================================================

/**
 * 格式化字节数（B/KB/MB/GB）
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export const isNative = isCapacitorAvailable;
