// 应用版本号工具 - 解决手机端和电脑端不同步问题
// 每次部署新代码时更新这里的版本号
// 版本号格式: YYYY.MM.DD-vN

export const APP_VERSION = '2026.06.11-v3';

// 构建时的时间戳
export const BUILD_TIMESTAMP = Date.now();

/**
 * 🔴 主动版本检测：
 * 1. 读取 localStorage 中保存的版本号
 * 2. 如果不一致（或首次）：保存新版本号
 * 3. 如果从旧版本更新 → 提示/自动刷新清除缓存
 *
 * 返回 true 表示是从旧版本更新的，需要刷新
 */
export function checkAppVersion(): {
  isFirstVisit: boolean;
  isUpdate: boolean;
  previousVersion: string | null;
  currentVersion: string;
  needsRefresh: boolean;
} {
  let previousVersion: string | null = null;
  let isFirstVisit = true;
  let needsRefresh = false;

  try {
    const storedVersion = localStorage.getItem('__APP_VERSION__');
    const storedHash = localStorage.getItem('__APP_BUILD__');

    if (storedVersion) {
      isFirstVisit = false;
      previousVersion = storedVersion;
      // 版本号不一致 → 需要刷新
      if (storedVersion !== APP_VERSION) {
        console.log(`[版本检测] 检测到更新: ${storedVersion} → ${APP_VERSION}`);
        needsRefresh = true;
      }
    }

    // 写入当前版本号
    localStorage.setItem('__APP_VERSION__', APP_VERSION);
    localStorage.setItem('__APP_BUILD__', String(BUILD_TIMESTAMP));
  } catch (e) {
    console.warn('[版本检测] 无法读写 localStorage:', e);
  }

  return {
    isFirstVisit,
    isUpdate: !isFirstVisit && needsRefresh,
    previousVersion,
    currentVersion: APP_VERSION,
    needsRefresh,
  };
}

/**
 * 🔴 清除所有缓存并刷新页面
 * - 清除 localStorage（保留用户登录状态）
 * - 清除 HTTP 缓存
 * - 强制刷新
 */
export function clearCacheAndReload(): void {
  try {
    // 保留登录状态
    const authData = localStorage.getItem('auth_user')
      || localStorage.getItem('user')
      || localStorage.getItem('token');

    // 清除旧的缓存类存储
    try {
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            try { caches.delete(name); } catch (e) {}
          });
        });
      }
    } catch (e) {}

    // 清除其他临时缓存，保留关键用户数据
    const toKeep: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth') || key.includes('user') || key.includes('token') || key.includes('settings'))) {
          toKeep[key] = localStorage.getItem(key) || '';
        }
      }
    } catch (e) {}

    try {
      localStorage.clear();
      // 恢复用户数据
      Object.keys(toKeep).forEach((key) => {
        localStorage.setItem(key, toKeep[key]);
      });
      // 写入新版本号
      localStorage.setItem('__APP_VERSION__', APP_VERSION);
    } catch (e) {}

    if (authData) {
      try { localStorage.setItem('auth_user', authData); } catch (e) {}
    }
  } catch (e) {
    console.warn('[缓存清理] 部分清理失败:', e);
  }

  // 强制刷新（不使用缓存）
  try {
    window.location.reload();
  } catch (e) {
    // 兜底：直接跳转到根
    window.location.href = '/';
  }
}

/**
 * 为 R2 资源 URL 添加动态防缓存参数
 * Cloudflare R2 的 URL 会被 CDN 缓存，通过添加查询参数绕过
 */
export function withCacheBuster(url: string): string {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('#')) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${BUILD_TIMESTAMP}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 轻量级版本号查询参数（仅用时间戳，适合缩略图等可缓存资源）
 */
export function withVersionBuster(url: string): string {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${BUILD_TIMESTAMP}`;
}

// 控制台输出（开发调试用）
if (typeof window !== 'undefined') {
  console.log(`[应用信息] 版本: ${APP_VERSION}`);
}
