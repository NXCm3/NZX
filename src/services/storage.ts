// Cloudflare D1 + R2 API 客户端 - 通过 Pages Functions 同源调用 (/api/*)

const API_BASE = '/api';

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

const http = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(API_BASE + url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    try {
      const err = await res.json();
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
  }
  return res.json();
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

  add: async (video: Omit<Video, 'id' | 'uploadedAt' | 'views'>): Promise<Video> => {
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
