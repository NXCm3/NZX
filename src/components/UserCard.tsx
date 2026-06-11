import React from 'react';
import { motion } from 'framer-motion';
import { Settings, LogOut, Upload, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface UserCardProps {
  /** 是否显示设置按钮回调 */
  onSettings?: () => void;
}

export default function UserCard({ onSettings }: UserCardProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-4 sm:mb-6"
    >
      {/* 用户信息 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-xl shrink-0">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900 dark:text-white text-base truncate">
            {user.username}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {user.role === 'admin' ? '管理员' : '普通用户'}
          </div>
        </div>
      </div>

      {/* 功能按钮网格 - 手机端2列大按钮，桌面端4列 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* 设置按钮 - 最显眼入口 */}
        <button
          onClick={onSettings}
          className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-4 sm:py-3 px-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-2xl transition-all active:scale-95"
        >
          <Settings size={22} className="sm:shrink-0" />
          <span className="text-sm font-semibold">设置</span>
        </button>
        
        {user.role === 'admin' && (
          <button
            onClick={() => navigate('/admin')}
            className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-4 sm:py-3 px-2 bg-purple-100 dark:bg-purple-900 hover:bg-purple-200 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-200 rounded-2xl transition-all active:scale-95"
          >
            <Shield size={22} className="sm:shrink-0" />
            <span className="text-sm font-semibold">管理</span>
          </button>
        )}
        
        <button
          onClick={() => navigate('/upload')}
          className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-4 sm:py-3 px-2 bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-700 dark:text-green-200 rounded-2xl transition-all active:scale-95"
        >
          <Upload size={22} className="sm:shrink-0" />
          <span className="text-sm font-semibold">上传</span>
        </button>
        
        <button
          onClick={handleLogout}
          className="flex flex-col sm:flex-row items-center justify-center gap-1.5 py-4 sm:py-3 px-2 bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 text-red-700 dark:text-red-200 rounded-2xl transition-all active:scale-95"
        >
          <LogOut size={22} className="sm:shrink-0" />
          <span className="text-sm font-semibold">退出</span>
        </button>
      </div>
    </motion.div>
  );
}
