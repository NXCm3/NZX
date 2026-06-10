import React, { createContext, useContext, useState, useEffect } from 'react';
import { userService } from '../services/storage';
import type { User as AppUser } from '../services/storage';

interface AuthContextType {
  user: AppUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查本地存储中是否有登录信息
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      // 验证用户是否仍然存在
      const verifiedUser = userService.getById(parsedUser.id);
      if (verifiedUser) {
        setUser(verifiedUser);
        userService.updateOnlineStatus(verifiedUser.id, true);
      } else {
        localStorage.removeItem('currentUser');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    // 模拟API调用延迟
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const foundUser = userService.authenticate(username, password);
    
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('currentUser', JSON.stringify(foundUser));
      userService.updateOnlineStatus(foundUser.id, true);
      return true;
    }
    
    return false;
  };

  const logout = () => {
    if (user) {
      userService.updateOnlineStatus(user.id, false);
    }
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
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
