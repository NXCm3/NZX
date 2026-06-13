import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService } from '../services/storage';
import type { Video } from '../services/storage';
import Header from '../components/Layout/Header';
import VideoCard from '../components/VideoCard';

export default function UserHome() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  // 加载视频列表
  useEffect(() => {
    loadVideos();
    // 每 10 秒轮询一次（避免太频繁请求）
    const videoInterval = setInterval(() => {
      loadVideos(true);
    }, 10000);
    return () => clearInterval(videoInterval);
  }, []);

  const loadVideos = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const allVideos = await videoService.getAll();
      setVideos(allVideos);
      setLoadError(null);
      // 提取所有标签
      const tags = new Set<string>();
      allVideos.forEach(v => { v.tags?.forEach(t => tags.add(t)); });
      setAllTags(Array.from(tags).sort());
    } catch (e: any) {
      console.error('加载视频失败:', e);
      if (!silent) setLoadError('网络连接失败，请检查网络后重试');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // 过滤视频（搜索 + 标签）
  const filteredVideos = useMemo(() => {
    let result = videos;
    if (activeTag) result = result.filter(v => v.tags?.includes(activeTag));
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(v =>
        v.title.toLowerCase().includes(query) ||
        v.description?.toLowerCase().includes(query) ||
        v.tags?.some(t => t.toLowerCase().includes(query))
      );
    }
    return result;
  }, [videos, searchQuery, activeTag]);

  const handleVideoClick = (videoId: string) => {
    videoService.incrementViews(videoId);
    navigate(`/video/${videoId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <Header />

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* 用户信息栏 */}
        {user && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 mb-4 sm:mb-6 shadow-sm"
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {user.username?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">
                    {user.username}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {user.role === 'admin' ? '管理员' : '普通用户'} · 共 {videos.length} 个视频
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/delete-videos')}
                className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors active:scale-95"
              >
                管理视频
              </button>
            </div>
          </motion.div>
        )}

        {/* 搜索栏 */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索视频标题、描述或标签..."
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 标签过滤 */}
        {allTags.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0">
              <Tag size={14} /> 标签:
            </span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors active:scale-95 ${
                  activeTag === tag
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* 网络错误提示 */}
        {loadError && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h4 className="font-semibold text-red-700 dark:text-red-400 text-sm">网络连接失败</h4>
                <p className="mt-1 text-sm text-red-600 dark:text-red-500">{loadError}</p>
              </div>
              <button
                onClick={() => loadVideos(false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl whitespace-nowrap active:scale-95"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {/* 标题区 */}
        <div className="mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {activeTag ? `#${activeTag}` : searchQuery ? '搜索结果' : '热门视频'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isLoading ? '加载中...' : (searchQuery || activeTag ? `找到 ${filteredVideos.length} 个相关视频` : `共 ${videos.length} 个精彩视频`)}
          </p>
        </div>

        {/* 视频网格 */}
        {filteredVideos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {filteredVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                manageable={false}
                selected={false}
                showCheckbox={false}
                onClick={() => handleVideoClick(video.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 sm:py-20">
            <div className="text-6xl mb-4">🎬</div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery || activeTag ? '没有找到相关视频' : '暂无视频'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {searchQuery || activeTag ? '尝试其他关键词或清除筛选条件' : '等待管理员上传精彩内容'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
