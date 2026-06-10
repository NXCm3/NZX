-- 视频表
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail TEXT NOT NULL,
  videoUrl TEXT NOT NULL,
  uploadedBy TEXT NOT NULL,
  uploadedByName TEXT NOT NULL,
  uploadedAt TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  videoId TEXT NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  replyTo TEXT,
  replyToUsername TEXT,
  FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE
);

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  createdAt TEXT NOT NULL,
  isOnline INTEGER NOT NULL DEFAULT 0,
  lastSeen TEXT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_videos_uploadedBy ON videos(uploadedBy);
CREATE INDEX IF NOT EXISTS idx_videos_uploadedByName ON videos(uploadedByName);
CREATE INDEX IF NOT EXISTS idx_comments_videoId ON comments(videoId);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 插入默认管理员账号（幂等）
INSERT OR IGNORE INTO users (id, username, password, role, createdAt, isOnline, lastSeen)
VALUES (
  'admin-001',
  'NXCm3',
  '8888aaaa',
  'admin',
  datetime('now'),
  0,
  datetime('now')
);
