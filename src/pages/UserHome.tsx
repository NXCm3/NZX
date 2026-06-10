import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Video as VideoIcon, Eye, Upload, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, onlineService } from '../services/storage';
import type { Video } from '../services/storage';

export default function UserHome() {
  const [videos, setVideos] = useState<Video[]>([]);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    loadVideos();

    // 每3秒轮询一次新视频(所有用户包括未登录)
    const videoInterval = setInterval(() => {
      loadVideos();
    }, 3000);

    // 更新在线状态(仅登录用户)
    let onlineInterval: NodeJS.Timeout | null = null;
    if (user) {
      onlineService.updateActivity(user.id);
      onlineInterval = setInterval(() => {
        onlineService.updateActivity(user.id);
      }, 30000); // 每30秒更新一次
    }

    return () => {
      clearInterval(videoInterval);
      if (onlineInterval) {
        clearInterval(onlineInterval);
      }
    };
  }, [user]);

  const loadVideos = async () => {
    try {
      const allVideos = await videoService.getAll();
      setVideos(allVideos);
    } catch (e: any) {
      console.error('加载视频失败:', e);
    }
  };

  const handleVideoClick = (videoId: string) => {
    // 增加观看次数
    videoService.incrementViews(videoId);
    navigate(`/video/${videoId}`);
  };

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    
    const video = videos.find(v => v.id === videoId);
    if (!video) return;
    
    if (user.role !== 'admin' && video.uploadedByName !== user.username) {
      alert('您没有权限删除此视频');
      return;
    }
    
    if (confirm('确定要删除该视频吗?')) {
      try {
        await videoService.delete(videoId);
        loadVideos();
      } catch (e: any) {
        alert('删除失败: ' + (e.message || e));
      }
    }
  };

  const canUploadVideo = !!user;
  const canDeleteVideo = (video: Video) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return video.uploadedByName === user.username;
  };

  const handleLogout = () => {
    if (user) {
      onlineService.removeUser(user.id);
    }
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <VideoIcon className="text-blue-600" size={28} />
              视频分享平台
            </h1>
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <span className="text-gray-600 dark:text-gray-400 hidden sm:inline">
                    欢迎, {user.username}
                  </span>
                  {canUploadVideo && (
                    <button
                      onClick={() => navigate('/upload')}
                      className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                    >
                      <Upload size={16} />
                      <span className="hidden sm:inline">上传视频</span>
                    </button>
                  )}
                  {user.role === 'admin' && (
                    <button
                      onClick={() => navigate('/admin')}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                    >
                      <span className="hidden sm:inline">管理后台</span>
                      <span className="sm:hidden">管理</span>
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                    title="退出登录"
                  >
                    <LogOut size={16} />
                    <span className="hidden sm:inline">退出</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <LogIn size={18} />
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            热门视频
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            发现精彩视频内容
          </p>
        </div>

        {videos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video, index) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleVideoClick(video.id)}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-200 group relative"
              >
                <div className="relative">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  {canDeleteVideo(video) && (
                    <button
                      onClick={(e) => handleDeleteVideo(video.id, e)}
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      title="删除视频"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {Math.floor(video.views / 60)}:{String(video.views % 60).padStart(2, '0')}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {video.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {video.description}
                  </p>
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Eye size={14} />
                      {video.views} 次观看
                    </span>
                    <span>{new Date(video.uploadedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    上传者: {video.uploadedByName}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <VideoIcon className="mx-auto text-gray-400" size={64} />
            <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              暂无视频
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {user ? '点击"上传视频"添加第一个视频' : '请联系管理员上传视频内容'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
