import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Video as VideoIcon, LogOut, Settings, Upload, LogIn, Shield } from 'lucide-react';
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
      // 使用浏览器历史回退，这样能正确返回到上一页而不是总是回到首页
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        // 如果没有历史记录（例如直接在子页面刷新），安全地回到首页
        navigate('/');
      }
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // 按钮样式统一：手机端友好的触摸区域，文字始终可见
  const btnBase = "flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors active:scale-95";
  const btnGray = "bg-gray-600 hover:bg-gray-700 text-white";
  const btnPurple = "bg-purple-600 hover:bg-purple-700 text-white";
  const btnGreen = "bg-green-600 hover:bg-green-700 text-white";
  const btnRed = "bg-red-600 hover:bg-red-700 text-white";
  const btnBack = "bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300";
  const btnBlue = "bg-blue-600 hover:bg-blue-700 text-white";

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-1 sm:gap-2">
          {/* 左侧：返回按钮或标题 */}
          {showBack ? (
            <button
              onClick={handleBack}
              className={`${btnBase} ${btnBack} shrink-0`}
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">返回</span>
            </button>
          ) : (
            <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-1.5 whitespace-nowrap min-w-0 shrink-0">
              <VideoIcon className="text-blue-600 shrink-0" size={22} />
              <span className="truncate hidden sm:inline">{title}</span>
              <span className="truncate sm:hidden">视频</span>
            </h1>
          )}

          {/* 中间：标题（仅子页面显示） */}
          {showBack && (
            <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate text-center flex-1 px-2">
              {title}
            </h1>
          )}

          {/* 右侧：操作按钮（手机端图标+精简文字，桌面端完整文字） */}
          {rightContent || (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-x-auto">
              {user ? (
                <>
                  <button
                    onClick={() => navigate('/settings')}
                    className={`${btnBase} ${btnGray}`}
                  >
                    <Settings size={18} />
                    <span className="hidden md:inline">账户</span>
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => navigate('/admin')}
                      className={`${btnBase} ${btnPurple}`}
                    >
                      <Shield size={18} />
                      <span className="hidden md:inline">管理</span>
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/upload')}
                    className={`${btnBase} ${btnGreen}`}
                  >
                    <Upload size={18} />
                    <span className="hidden md:inline">上传</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className={`${btnBase} ${btnRed}`}
                  >
                    <LogOut size={18} />
                    <span className="hidden md:inline">退出</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className={`${btnBase} ${btnBlue}`}
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
