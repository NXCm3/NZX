import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Video as VideoIcon, LogOut, Settings, Upload, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  /** 标题文字 */
  title?: string;
  /** 是否显示返回按钮（用于子页面） */
  showBack?: boolean;
  /** 自定义右侧内容 */
  rightContent?: React.ReactNode;
  /** 返回按钮点击事件 */
  onBack?: () => void;
}

export default function Header({ 
  title = '视频分享平台', 
  showBack = false,
  rightContent,
  onBack 
}: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16 gap-2">
          {/* 左侧：返回按钮或标题 */}
          {showBack ? (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm shrink-0"
            >
              <ArrowLeft size={16} />
              <span>返回</span>
            </button>
          ) : (
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 whitespace-nowrap min-w-0 shrink-0">
              <VideoIcon className="text-blue-600 shrink-0" size={20} />
              <span>{title}</span>
            </h1>
          )}

          {/* 中间：标题（仅子页面显示） */}
          {showBack && (
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {title}
            </h1>
          )}

          {/* 右侧：操作按钮 */}
          {rightContent || (
            <div className="flex items-center gap-2 shrink-0">
              {user ? (
                <>
                  <button
                    onClick={() => navigate('/settings')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <Settings size={16} />
                    <span>账户</span>
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => navigate('/admin')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                    >
                      <Settings size={16} />
                      <span>管理</span>
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/upload')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <Upload size={16} />
                    <span>上传</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <LogOut size={16} />
                    <span>退出</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  <LogIn size={18} />
                  <span>登录</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
