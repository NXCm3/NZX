// Cloudflare D1 + R2 API 客户端 - 使用完整 URL 确保网页版和手机版都能正常工作
// 统一使用完整 URL（CORS 已在 Cloudflare 配置），数据完全同步

const API_BASE = 'https://nzx-5o4.pages.dev/api';

export interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  views: number;
  tags?: string[];
}

export interface Comment {
  id: string;
  videoId: string;
  username: string;
  content: string;
  createdAt: string;
  replyTo?: string;
  replyToUsername?: string;
}

export interface User {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'user';
  createdAt: string;
  isOnline: boolean;
  lastSeen: string;
}

const ADMIN_ACCOUNT = {
  id: 'admin-001',
  username: 'NXCm3',
  password: '8888aaaa',
  role: 'admin' as const,
};

// HTTP 请求工具 - 手机 APP 专用
// 注意：只发送最小请求头，避免 CORS 预检失败
const http = async (url: string, options: RequestInit = {}, timeout = 10000) => {
  // 防缓存：添加 ?_t=时间戳（URL参数，不使用 URL 查询参数方式防缓存
  const cacheBuster = `${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  const finalUrl = API_BASE + url + cacheBuster;

  console.log(`[API请求] ${options.method || 'GET'} ${finalUrl}`);

  // 超时控制器
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // 只发送最小请求头，避免 CORS 预检（手机端常见问题）
    const safeHeaders: Record<string, string> = {};
    // 仅对有 body 的请求才加 Content-Type，避免 GET 请求触发预检
    if (options.body) {
      safeHeaders['Content-Type'] = 'application/json';
    }
    // 合并用户自定义头
    if (options.headers) {
      Object.assign(safeHeaders, options.headers);
    }

    const res = await fetch(finalUrl, {
      ...options,
      cache: 'no-store',
      headers: safeHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log(`[API响应] ${res.status} ${finalUrl}`);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        msg = err.error || err.message || msg;
      } catch {
        // 忽略解析失败
      }
      console.error(`[API错误] ${res.status}: ${msg}`);
      throw new Error(msg);
    }

    const data = await res.json();
    console.log(`[API成功] 返回:`, Array.isArray(data) ? `${data.length} 条` : '成功');
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    // 判断是否为超时错误
    if (error.name === 'AbortError') {
      console.error(`[API超时] ${finalUrl}: 请求超过 ${timeout}ms`);
      throw new Error('请求超时，请检查网络连接');
    }
    const errMsg = error?.message || String(error) || '网络连接失败';
    console.error(`[API失败] ${finalUrl}: ${errMsg}`);
    // 抛出带有详细信息的错误，供 UI 层显示
    const friendlyError = new Error(errMsg);
    (friendlyError as any).url = finalUrl;
    (friendlyError as any).original = error;
    throw friendlyError;
  }
};

// ---------- 视频相关操作 ----------
export const videoService = {
  getAll: async (): Promise<Video[]> => {
    return http('/videos');
  },

  getById: async (id: string): Promise<Video | undefined> => {
    try {
      return await http(`/videos/${encodeURIComponent(id)}`);
    } catch {
      return undefined;
    }
  },

  getByUser: async (username: string): Promise<Video[]> => {
    return http(`/videos?byUser=${encodeURIComponent(username)}`);
  },

  add: async (video: Omit<Video, 'id' | 'uploadedAt' | 'views'> & { tags?: string[] }): Promise<Video> => {
    return http('/videos', {
      method: 'POST',
      body: JSON.stringify(video),
    });
  },

  delete: async (id: string): Promise<void> => {
    await http(`/videos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  deleteMultiple: async (ids: string[]): Promise<void> => {
    await http('/videos/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  incrementViews: async (id: string): Promise<void> => {
    await http(`/videos/${encodeURIComponent(id)}/views`, { method: 'POST' });
  },
};

// ---------- 评论相关操作 ----------
export const commentService = {
  getAll: async (): Promise<Comment[]> => {
    // 服务端没有这个接口，返回空数组作为降级
    return [];
  },

  getByVideoId: async (videoId: string): Promise<Comment[]> => {
    return http(`/videos/${encodeURIComponent(videoId)}/comments`);
  },

  add: async (comment: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment> => {
    return http('/comments', {
      method: 'POST',
      body: JSON.stringify(comment),
    });
  },

  delete: async (id: string): Promise<void> => {
    await http(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

// ---------- 用户相关操作 ----------
export const userService = {
  getAll: async (): Promise<User[]> => {
    return http('/users');
  },

  getAllIncludingAdmin: async (): Promise<User[]> => {
    return http('/users?includeAdmin=1');
  },

  getById: async (id: string): Promise<User | undefined> => {
    try {
      return await http(`/users/${encodeURIComponent(id)}`);
    } catch {
      return undefined;
    }
  },

  authenticate: async (username: string, password: string): Promise<User | null> => {
    try {
      return await http('/auth', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    } catch (e: any) {
      console.error('Auth failed:', e);
      return null;
    }
  },

  add: async (user: Omit<User, 'id' | 'createdAt' | 'isOnline' | 'lastSeen'>): Promise<User> => {
    return http('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  },

  delete: async (id: string): Promise<void> => {
    await http(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  update: async (id: string, update: { username?: string; password?: string; role?: 'admin' | 'user' }): Promise<User> => {
    return await http(`/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    });
  },

  updateOnlineStatus: async (id: string, isOnline: boolean): Promise<void> => {
    if (isOnline) {
      await http(`/users/${encodeURIComponent(id)}/activity`, { method: 'POST' });
    } else {
      await http(`/users/${encodeURIComponent(id)}/logout`, { method: 'POST' });
    }
  },

  getUserVideoCount: async (username: string): Promise<number> => {
    const res = await http(`/users/${encodeURIComponent(username)}/video-count`);
    return res?.count || 0;
  },
};

// ---------- 在线用户统计 ----------
// 注意: Worker 模式下在线状态由数据库维护，这里仅提供封装
export const onlineService = {
  getOnlineCount: async (): Promise<number> => {
    try {
      const users: User[] = await http('/users');
      return users.filter(u => !!u.isOnline).length;
    } catch {
      return 0;
    }
  },

  updateActivity: async (userId: string): Promise<void> => {
    await userService.updateOnlineStatus(userId, true);
  },

  removeUser: async (userId: string): Promise<void> => {
    await userService.updateOnlineStatus(userId, false);
  },
};

// ---------- 文件存储服务 ----------
// 视频文件和缩略图通过 Worker R2 上传
export const fileService = {
  saveVideo: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(API_BASE + '/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`);
    const data = await res.json();
    return data.url;
  },

  saveThumbnail: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(API_BASE + '/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`);
    const data = await res.json();
    return data.url;
  },
};
