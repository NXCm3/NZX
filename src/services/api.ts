// 统一 API 工具 - 使用完整 URL，确保网页版和手机版都能正常工作
// 核心特性：
// 1. 所有请求添加防缓存头，防止运营商/CDN缓存
// 2. 时间戳 query 参数防止 HTTP 缓存
// 3. 版本号检测机制 - 检测到新版本时提示用户刷新

import { APP_VERSION } from '../utils/version';

// 统一使用完整 URL（CORS 已在 Cloudflare 配置）
// 这样网页版和 APK 版都使用同一个 API，数据完全同步
const API_BASE = 'https://nzx-5o4.pages.dev/api';

/**
 * 响应头版本检测已移除
 * 统一使用 AppUpdateManager 组件进行版本检测
 * 避免与原生更新机制冲突
 */
function checkAppVersion(response: Response) {
  // 空实现 - 版本检测由 AppUpdateManager 统一处理
}

/**
 * 统一的 fetch 包装函数
 * - 添加防缓存头
 * - 添加时间戳防止缓存
 * - 统一错误处理
 * - 版本号检测
 */
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? path : '/' + path}`;

  // 确保 headers 对象存在
  const headers: Record<string, string> = {
    // 防缓存头 - 防止移动运营商、CDN、浏览器缓存 API 响应
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'X-App-Version': APP_VERSION,
    // 合并用户传入的 headers
    ...(options.headers as Record<string, string> || {}),
  };

  // 如果不是 GET/HEAD 请求且未指定 Content-Type，默认使用 JSON
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // 添加时间戳 query 参数防止 HTTP 缓存
  const finalUrl = addCacheBuster(url);

  try {
    const response = await fetch(finalUrl, {
      ...options,
      headers,
      // 确保不会从 HTTP 缓存读取
      cache: 'no-store',
    });

    // 检测应用版本
    checkAppVersion(response);

    // 处理响应
    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const error = new Error(
        typeof data === 'object' && data.error
          ? data.error
          : `请求失败 (${response.status})`
      );
      (error as any).status = response.status;
      (error as any).data = data;
      throw error;
    }

    return data as T;
  } catch (error) {
    console.error(`[API 请求失败] ${method} ${url}:`, error);
    throw error;
  }
}

/**
 * 添加防缓存的时间戳参数
 * /api/videos -> /api/videos?_t=1234567890
 */
function addCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
}

// 便捷方法
export const api = {
  get: <T = any>(path: string, options: RequestInit = {}) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),

  post: <T = any>(path: string, body?: any, options: RequestInit = {}) =>
    apiFetch<T>(path, {
      ...options,
      method: 'POST',
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }),

  put: <T = any>(path: string, body?: any, options: RequestInit = {}) =>
    apiFetch<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }),

  delete: <T = any>(path: string, options: RequestInit = {}) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),

  // multipart/form-data 上传专用（不自动设置 Content-Type）
  upload: <T = any>(path: string, formData: FormData, options: RequestInit = {}) =>
    apiFetch<T>(path, {
      ...options,
      method: 'POST',
      body: formData,
      // 让浏览器自动设置 multipart boundary
      headers: {
        ...(options.headers as Record<string, string> || {}),
      } as any,
    }),
};

/**
 * 强制清除缓存并刷新页面（用户手动触发）
 */
export function forceRefresh() {
  // 清除 Service Worker 缓存（如果有）
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
  // 强制刷新
  window.location.reload();
}
