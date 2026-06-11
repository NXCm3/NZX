import React, { createContext, useContext, useState, useEffect } from 'react';
import { userService } from '../services/storage';
import type { User as AppUser } from '../services/storage';

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
    const init = async () => {
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          const verifiedUser = await userService.getById(parsedUser.id);
          if (verifiedUser) {
            setUser(verifiedUser);
            await userService.updateOnlineStatus(verifiedUser.id, true);
          } else {
            localStorage.removeItem('currentUser');
          }
        } catch {
          localStorage.removeItem('currentUser');
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const foundUser = await userService.authenticate(username, password);

      if (foundUser) {
        setUser(foundUser);
        localStorage.setItem('currentUser', JSON.stringify(foundUser));
        await userService.updateOnlineStatus(foundUser.id, true);
        return true;
      }
    } catch (e: any) {
      console.error('Login error:', e);
    }
    return false;
  };

  const logout = async () => {
    if (user) {
      try {
        await userService.updateOnlineStatus(user.id, false);
      } catch (e) {
        console.error('Logout error:', e);
      }
    }
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  const updateCurrentUser = (newUser: AppUser) => {
    setUser(newUser);
    localStorage.setItem('currentUser', JSON.stringify(newUser));
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
