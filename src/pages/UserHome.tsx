import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Video as VideoIcon, X, Save, CheckSquare, Square, Trash, Search, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, userService } from '../services/storage';
import type { Video } from '../services/storage';
import Header from '../components/Layout/Header';
import VideoCard from '../components/VideoCard';
import UserCard from '../components/UserCard';

export default function UserHome() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const navigate = useNavigate();
  const { user, logout, updateCurrentUser } = useAuth();

  // 账户设置弹窗
  const [showSettings, setShowSettings] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // 批量选择状态
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

  useEffect(() => {
    if (showSettings && user) {
      setEditUsername(user.username);
      setEditPassword('');
      setEditConfirmPassword('');
    }
  }, [showSettings, user]);

  useEffect(() => {
    loadVideos();
    // 每3秒轮询一次新视频
    const videoInterval = setInterval(() => {
      loadVideos();
    }, 3000);
    return () => clearInterval(videoInterval);
  }, []);

  const loadVideos = async () => {
    try {
      const allVideos = await videoService.getAll();
      setVideos(allVideos);
      // 提取所有标签
      const tags = new Set<string>();
      allVideos.forEach(v => {
        v.tags?.forEach(t => tags.add(t));
      });
      setAllTags(Array.from(tags).sort());
    } catch (e: any) {
      console.error('加载视频失败:', e);
    }
  };

  // 过滤视频（搜索 + 标签）
  const filteredVideos = useMemo(() => {
    let result = videos;
    
    // 标签过滤
    if (activeTag) {
      result = result.filter(v => v.tags?.includes(activeTag));
    }
    
    // 搜索过滤
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

  const handleTagClick = (tag: string) => {
    setActiveTag(activeTag === tag ? null : tag);
  };

  const handleVideoClick = (videoId: string) => {
    videoService.incrementViews(videoId);
    navigate(`/video/${videoId}`);
  };

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除该视频吗？')) return;
    try {
      await videoService.delete(videoId);
      loadVideos();
    } catch (e: any) {
      alert('删除失败: ' + (e.message || e));
    }
  };

  // 当前用户可管理的视频（本人上传 + 管理员可管全部）
  const getManageableVideos = () => {
    if (!user) return [];
    if (user.role === 'admin') return videos;
    return videos.filter(v => v.uploadedByName === user.username);
  };

  const manageableIds = new Set(getManageableVideos().map(v => v.id));

  const handleToggleSelect = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedVideoIds);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideoIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedVideoIds.size === manageableIds.size) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(manageableIds));
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedVideoIds);
    if (!ids.length) return;
    if (!confirm(`确定要删除选中的 ${ids.length} 个视频吗？相关评论也会被删除。`)) return;
    setBatchDeleteLoading(true);
    try {
      for (const id of ids) {
        await videoService.delete(id);
      }
      setSelectedVideoIds(new Set());
      loadVideos();
    } catch (e: any) {
      alert('删除失败: ' + (e.message || e));
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!editUsername.trim()) {
      alert('用户名不能为空');
      return;
    }
    if (editUsername.trim().length < 2) {
      alert('用户名至少 2 个字符');
      return;
    }
    if (editPassword.length > 0 && editPassword.length < 6) {
      alert('新密码至少 6 个字符');
      return;
    }
    if (editPassword.length > 0 && editPassword !== editConfirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }

    setEditLoading(true);
    try {
      const payload: any = {};
      if (editUsername.trim() !== user.username) payload.username = editUsername.trim();
      if (editPassword.length > 0) payload.password = editPassword;

      if (Object.keys(payload).length === 0) {
        alert('未检测到任何修改');
        setEditLoading(false);
        return;
      }

      const updated = await userService.update(user.id, payload);
      if (typeof updateCurrentUser === 'function') {
        updateCurrentUser({ ...user, username: updated.username });
      }
      setShowSettings(false);
      alert('账户信息已更新');
    } catch (err: any) {
      alert(err.message || '更新失败');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <Header />

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* 用户功能卡片 */}
        {user && (
          <UserCard onSettings={() => setShowSettings(true)} />
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
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* 标签过滤 */}
        {allTags.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0">
              <Tag size={14} />
              标签:
            </span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
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

        {/* 标题和操作区 - 手机端垂直排列 */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {activeTag ? `#${activeTag}` : searchQuery ? '搜索结果' : '热门视频'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {searchQuery || activeTag ? `找到 ${filteredVideos.length} 个相关视频` : `共 ${videos.length} 个精彩视频`}
            </p>
          </div>
          {user && manageableIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm transition-colors active:scale-95"
              >
                {selectedVideoIds.size === manageableIds.size ? <CheckSquare size={18} /> : <Square size={18} />}
                {selectedVideoIds.size > 0 ? `${selectedVideoIds.size}/${manageableIds.size}` : '全选'}
              </button>
              {selectedVideoIds.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  disabled={batchDeleteLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm transition-colors active:scale-95"
                >
                  <Trash size={18} />
                  {batchDeleteLoading ? '删除中...' : '删除'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 视频网格 - 响应式：手机2列，平板3列，桌面4列 */}
        {filteredVideos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {filteredVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                manageable={manageableIds.has(video.id)}
                selected={selectedVideoIds.has(video.id)}
                showCheckbox={manageableIds.has(video.id)}
                onClick={() => handleVideoClick(video.id)}
                onDelete={(e) => handleDeleteVideo(video.id, e)}
                onSelect={(e) => handleToggleSelect(video.id, e)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 sm:py-20">
            <VideoIcon className="mx-auto text-gray-400" size={56} />
            <h3 className="mt-4 text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              {searchQuery || activeTag ? '没有找到相关视频' : '暂无视频'}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {searchQuery || activeTag 
                ? '尝试其他关键词或清除筛选条件' 
                : (user ? '点击上方"上传"按钮添加第一个视频' : '请联系管理员上传视频内容')
              }
            </p>
            {(searchQuery || activeTag) && (
              <button
                onClick={() => { setSearchQuery(''); setActiveTag(null); }}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors active:scale-95"
              >
                清除筛选
              </button>
            )}
          </div>
        )}
      </main>

      {/* 账户设置弹窗 */}
      <AnimatePresence>
        {showSettings && user && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md"
            >
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">账户设置</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 active:scale-90 transition-transform"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="px-4 sm:px-6 py-4 space-y-5 max-h-[65vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    用户名
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">至少 2 个字符</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    新密码（留空则不修改）
                  </label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="至少 6 个字符"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    确认新密码
                  </label>
                  <input
                    type="password"
                    value={editConfirmPassword}
                    onChange={(e) => setEditConfirmPassword(e.target.value)}
                    placeholder="再次输入新密码"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                  />
                </div>

                {manageableIds.size > 0 && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">我的视频</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{manageableIds.size} 个</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm transition-colors active:scale-95"
                      >
                        {selectedVideoIds.size === manageableIds.size ? <CheckSquare size={16} /> : <Square size={16} />}
                        {selectedVideoIds.size > 0 ? `${selectedVideoIds.size} 已选` : '全选'}
                      </button>
                      {selectedVideoIds.size > 0 && (
                        <button
                          onClick={handleBatchDelete}
                          disabled={batchDeleteLoading}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm transition-colors active:scale-95"
                        >
                          <Trash size={16} />
                          {batchDeleteLoading ? '删除中...' : '删除'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4 bg-gray-50 dark:bg-gray-900">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm transition-colors font-medium active:scale-95"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={editLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm transition-colors font-medium active:scale-95"
                >
                  <Save size={18} />
                  {editLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
