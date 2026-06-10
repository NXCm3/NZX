// 本地存储服务 - 模拟数据库功能

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
  replyTo?: string; // 回复的评论ID
  replyToUsername?: string; // 回复的用户名
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

// 管理员账号配置(硬编码,不可修改)
const ADMIN_ACCOUNT = {
  id: 'admin-001',
  username: 'NXCm3',
  password: '8888aaaa',
  role: 'admin' as const,
};

// 初始化默认数据
const initializeData = () => {
  if (!localStorage.getItem('videos')) {
    localStorage.setItem('videos', JSON.stringify([]));
  }
  if (!localStorage.getItem('comments')) {
    localStorage.setItem('comments', JSON.stringify([]));
  }
  if (!localStorage.getItem('users')) {
    // 初始化管理员账号(不存储在localStorage中,仅作为验证参考)
    localStorage.setItem('users', JSON.stringify([]));
  }
  if (!localStorage.getItem('onlineUsers')) {
    localStorage.setItem('onlineUsers', JSON.stringify({}));
  }
};

initializeData();

// 视频相关操作
export const videoService = {
  getAll: (): Video[] => {
    return JSON.parse(localStorage.getItem('videos') || '[]');
  },

  getById: (id: string): Video | undefined => {
    const videos = videoService.getAll();
    return videos.find(v => v.id === id);
  },

  getByUser: (username: string): Video[] => {
    const videos = videoService.getAll();
    return videos.filter(v => v.uploadedByName === username);
  },

  add: (video: Omit<Video, 'id' | 'uploadedAt' | 'views'>): Video => {
    const videos = videoService.getAll();
    const newVideo: Video = {
      ...video,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      uploadedAt: new Date().toISOString(),
      views: 0,
    };
    videos.unshift(newVideo);
    localStorage.setItem('videos', JSON.stringify(videos));
    return newVideo;
  },

  delete: (id: string): void => {
    const videos = videoService.getAll();
    const filtered = videos.filter(v => v.id !== id);
    localStorage.setItem('videos', JSON.stringify(filtered));
    
    // 同时删除相关评论
    const comments = commentService.getAll();
    const filteredComments = comments.filter(c => c.videoId !== id);
    localStorage.setItem('comments', JSON.stringify(filteredComments));
  },

  deleteMultiple: (ids: string[]): void => {
    const videos = videoService.getAll();
    const filtered = videos.filter(v => !ids.includes(v.id));
    localStorage.setItem('videos', JSON.stringify(filtered));
    
    // 删除相关评论
    const comments = commentService.getAll();
    const filteredComments = comments.filter(c => !ids.includes(c.videoId));
    localStorage.setItem('comments', JSON.stringify(filteredComments));
  },

  incrementViews: (id: string): void => {
    const videos = videoService.getAll();
    const video = videos.find(v => v.id === id);
    if (video) {
      video.views += 1;
      localStorage.setItem('videos', JSON.stringify(videos));
    }
  },
};

// 评论相关操作
export const commentService = {
  getAll: (): Comment[] => {
    return JSON.parse(localStorage.getItem('comments') || '[]');
  },

  getByVideoId: (videoId: string): Comment[] => {
    const comments = commentService.getAll();
    return comments.filter(c => c.videoId === videoId);
  },

  add: (comment: Omit<Comment, 'id' | 'createdAt'>): Comment => {
    const comments = commentService.getAll();
    const newComment: Comment = {
      ...comment,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    comments.push(newComment);
    localStorage.setItem('comments', JSON.stringify(comments));
    return newComment;
  },

  delete: (id: string): void => {
    const comments = commentService.getAll();
    const filtered = comments.filter(c => c.id !== id);
    localStorage.setItem('comments', JSON.stringify(filtered));
  },
};

// 用户相关操作
export const userService = {
  getAll: (): User[] => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    // 管理员账号不显示在列表中
    return users.filter(u => u.id !== ADMIN_ACCOUNT.id);
  },

  getAllIncludingAdmin: (): User[] => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    // 添加管理员账号到列表(但标记为不可删除)
    const adminUser: User = {
      ...ADMIN_ACCOUNT,
      createdAt: new Date().toISOString(),
      isOnline: false,
      lastSeen: new Date().toISOString(),
    };
    return [adminUser, ...users];
  },

  getById: (id: string): User | undefined => {
    if (id === ADMIN_ACCOUNT.id) {
      return {
        ...ADMIN_ACCOUNT,
        createdAt: new Date().toISOString(),
        isOnline: false,
        lastSeen: new Date().toISOString(),
      };
    }
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    return users.find(u => u.id === id);
  },

  authenticate: (username: string, password: string): User | null => {
    // 检查管理员账号
    if (username === ADMIN_ACCOUNT.username && password === ADMIN_ACCOUNT.password) {
      return {
        ...ADMIN_ACCOUNT,
        createdAt: new Date().toISOString(),
        isOnline: true,
        lastSeen: new Date().toISOString(),
      };
    }
    
    // 检查普通用户
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      return { ...user, isOnline: true, lastSeen: new Date().toISOString() };
    }
    
    return null;
  },

  add: (user: Omit<User, 'id' | 'createdAt' | 'isOnline' | 'lastSeen'>): User => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // 检查用户名是否已存在(包括管理员)
    if (users.find(u => u.username === user.username) || user.username === ADMIN_ACCOUNT.username) {
      throw new Error('用户名已存在');
    }
    
    const newUser: User = {
      ...user,
      id: 'user-' + Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      isOnline: false,
      lastSeen: new Date().toISOString(),
    };
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    return newUser;
  },

  delete: (id: string): void => {
    // 不能删除管理员
    if (id === ADMIN_ACCOUNT.id) {
      throw new Error('不能删除管理员账号');
    }
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const filtered = users.filter(u => u.id !== id);
    localStorage.setItem('users', JSON.stringify(filtered));
    
    // 删除该用户上传的所有视频
    const user = users.find(u => u.id === id);
    if (user) {
      const videos = videoService.getAll();
      const filteredVideos = videos.filter(v => v.uploadedByName !== user.username);
      localStorage.setItem('videos', JSON.stringify(filteredVideos));
    }
  },

  updateOnlineStatus: (id: string, isOnline: boolean): void => {
    if (id === ADMIN_ACCOUNT.id) return; // 不更新管理员状态
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex !== -1) {
      users[userIndex].isOnline = isOnline;
      users[userIndex].lastSeen = new Date().toISOString();
      localStorage.setItem('users', JSON.stringify(users));
    }
  },

  getUserVideoCount: (username: string): number => {
    const videos = videoService.getAll();
    return videos.filter(v => v.uploadedByName === username).length;
  },
};

// 在线用户统计
export const onlineService = {
  getOnlineCount: (): number => {
    const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
    const now = Date.now();
    // 清理超过5分钟未活动的用户
    const activeUsers = Object.entries(onlineUsers).filter(
      ([_, timestamp]) => now - (timestamp as number) < 5 * 60 * 1000
    );
    const cleaned = Object.fromEntries(activeUsers);
    localStorage.setItem('onlineUsers', JSON.stringify(cleaned));
    return activeUsers.length;
  },

  updateActivity: (userId: string): void => {
    const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
    onlineUsers[userId] = Date.now();
    localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
    
    // 同时更新用户在线状态
    userService.updateOnlineStatus(userId, true);
  },

  removeUser: (userId: string): void => {
    const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
    delete onlineUsers[userId];
    localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
    
    // 更新用户离线状态
    userService.updateOnlineStatus(userId, false);
  },
};

// 文件存储服务
export const fileService = {
  // 保存视频文件
  saveVideo: async (file: File, filename: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // 在实际项目中,这里应该上传到服务器
        // 当前使用base64存储
        resolve(reader.result as string);
      };
      reader.onerror = error => reject(error);
    });
  },

  // 保存缩略图
  saveThumbnail: async (file: File, filename: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = error => reject(error);
    });
  },
};
