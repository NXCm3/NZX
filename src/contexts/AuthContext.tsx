import React, { createContext, useContext, useState, useEffect } from 'react';
import { userService } from '../services/storage';
import type { User as AppUser } from '../services/storage';

// --------------------------------------------------------------------------
// Auth 认证上下文
// 关键设计原则：
// 1. 初始化绝不阻塞时间 < 200ms — 不做任何 HTTP 网络请求
// 2. 从 localStorage 恢复会话时直接信任本地缓存，不做 API 校验
// 3. 任何网络相关的更新（在线状态、刷新用户信息）都在后台异步执行
// --------------------------------------------------------------------------

interface AuthContextType {
  user: AppUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateCurrentUser: (newUser: AppUser) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 🔴 关键：初始化同步完成，绝不做 HTTP 请求
    // 只从 localStorage 读取缓存的用户信息
    // 这样启动时间 < 200ms，避免白屏
    try {
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        // 基本字段是否存在 id 字段就信任并继续
        if (parsed && parsed.id && parsed.username) {
          setUser(parsed);
          // 后台异步更新在线状态（失败不影响已登录状态
          userService.updateOnlineStatus(parsed.id, true).catch(() => {});
        } else {
          localStorage.removeItem('currentUser');
        }
      }
    } catch (e) {
      // 解析失败，清除损坏的缓存
      try { localStorage.removeItem('currentUser'); } catch (_) {}
    } finally {
      // 🔴 无论成功失败都立即结束 loading
      setLoading(false);
    }
  }, []);

  // 登录函数
  // 唯一的步骤：
  // 1. 调用 userService.authenticate — 这是唯一的阻塞步骤
  // 2. 成功后立即 setUser + 保存到 localStorage
  // 3. 在线状态更新后台执行，绝不阻塞登录
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const foundUser = await userService.authenticate(username, password);
      if (foundUser) {
        setUser(foundUser);
        try {
          localStorage.setItem('currentUser', JSON.stringify(foundUser));
        } catch (storageErr) {
          // localStorage 失败也不影响登录成功
        }
        // 在线状态更新 — 后台异步执行
        userService.updateOnlineStatus(foundUser.id, true).catch(() => {});
        return true;
      }
      return false;
    } catch (e: any) {
      // 重新抛出 — UI 层可以显示错误信息
      throw e;
    }
  };

  const logout = () => {
    if (user) {
      // 在线状态更新 — 后台异步执行
      userService.updateOnlineStatus(user.id, false).catch(() => {});
    }
    setUser(null);
    try {
      localStorage.removeItem('currentUser');
    } catch (e) {
      // ignore
    }
  };

  const updateCurrentUser = (newUser: AppUser) => {
    setUser(newUser);
    try {
      localStorage.setItem('currentUser', JSON.stringify(newUser));
    } catch (e) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateCurrentUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
