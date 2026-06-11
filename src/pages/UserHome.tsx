import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Video as VideoIcon, Eye, Upload, Trash2, Settings, X, Save, CheckSquare, Square, Trash } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, onlineService, userService } from '../services/storage';
import type { Video } from '../services/storage';

export default function UserHome() {
  const [videos, setVideos] = useState<Video[]>([]);
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

    // 每3秒轮询一次新视频(所有用户包括未登录)
    const videoInterval = setInterval(() => {
      loadVideos();
    }, 3000);

    // 更新在线状态(仅登录用户)
    let onlineInterval: number | null = null;
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
      alert('批量删除完成');
    } catch (e: any) {
      alert('删除失败: ' + (e.message || e));
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  const handleLogout = () => {
    if (user) {
      onlineService.removeUser(user.id);
    }
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
      {/* 顶部导航 - 手机优先 */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 gap-2 sm:gap-3">
            <h1 className="text-base sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap min-w-0 shrink-0">
              <VideoIcon className="text-blue-600 shrink-0" size={18} />
              <span className="hidden sm:inline">视频分享平台</span>
              <span className="sm:hidden truncate">视频</span>
            </h1>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-wrap">
              {user ? (
                <>
                  {/* 账户设置 */}
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-xs sm:text-sm"
                  >
                    <Settings size={16} />
                    <span>账户</span>
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => navigate('/admin')}
                      className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-xs sm:text-sm"
                    >
                      <Settings size={16} />
                      <span>管理</span>
                    </button>
                  )}
                  {canUploadVideo && (
                    <button
                      onClick={() => navigate('/upload')}
                      className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-xs sm:text-sm"
                    >
                      <Upload size={16} />
                      <span>上传</span>
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-xs sm:text-sm"
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
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* 用户功能卡片 - 手机端确保可见 */}
        {user && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4 mb-4 sm:mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-xl">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-gray-900 dark:text-white text-base">
                    {user.username}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {user.role === 'admin' ? '👑 管理员' : '👤 普通用户'}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="flex flex-col items-center justify-center py-3 px-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
              >
                <Settings size={20} className="mb-1" />
                <span className="text-xs font-medium">设置</span>
              </button>
              {user.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  className="flex flex-col items-center justify-center py-3 px-2 bg-purple-100 dark:bg-purple-900 hover:bg-purple-200 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-200 rounded-lg transition-colors"
                >
                  <Settings size={20} className="mb-1" />
                  <span className="text-xs font-medium">管理</span>
                </button>
              )}
              {canUploadVideo && (
                <button
                  onClick={() => navigate('/upload')}
                  className="flex flex-col items-center justify-center py-3 px-2 bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-700 dark:text-green-200 rounded-lg transition-colors"
                >
                  <Upload size={20} className="mb-1" />
                  <span className="text-xs font-medium">上传</span>
                </button>
              )}
              <button
                onClick={handleLogout}
                className="flex flex-col items-center justify-center py-3 px-2 bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 text-red-700 dark:text-red-200 rounded-lg transition-colors"
              >
                <LogOut size={20} className="mb-1" />
                <span className="text-xs font-medium">退出</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
              热门视频
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              发现精彩视频内容
            </p>
          </div>
          {user && manageableIds.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm transition-colors"
              >
                {selectedVideoIds.size === manageableIds.size ? <CheckSquare size={16} /> : <Square size={16} />}
                {selectedVideoIds.size > 0 ? `${selectedVideoIds.size}/${manageableIds.size}` : '全选'}
              </button>
              {selectedVideoIds.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  disabled={batchDeleteLoading}
                  className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-sm transition-colors"
                >
                  <Trash size={16} />
                  {batchDeleteLoading ? '删除中...' : `删除`}
                </button>
              )}
            </div>
          )}
        </div>

        {videos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {videos.map((video, index) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleVideoClick(video.id)}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-200 group relative"
              >
                <div className="relative" style={{ aspectRatio: '4/3' }}>
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-contain bg-black"
                  />
                  {manageableIds.has(video.id) && (
                    <button
                      onClick={(e) => handleToggleSelect(video.id, e)}
                      className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        selectedVideoIds.has(video.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/80 text-gray-600 opacity-0 group-hover:opacity-100'
                      }`}
                      title={selectedVideoIds.has(video.id) ? '取消选中' : '选中'}
                    >
                      {selectedVideoIds.has(video.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                  )}
                  {canDeleteVideo(video) && (
                    <button
                      onClick={(e) => handleDeleteVideo(video.id, e)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="删除视频"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {video.views}
                  </div>
                </div>
                <div className="p-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 group-hover:text-blue-600 transition-colors text-xs">
                    {video.title}
                  </h3>
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

      {showSettings && user && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md"
          >
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 px-4 py-3 sm:p-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">账户设置</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-4 py-4 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  用户名
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">至少 2 个字符</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  新密码（留空则不修改）
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="至少 6 个字符"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  确认新密码
                </label>
                <input
                  type="password"
                  value={editConfirmPassword}
                  onChange={(e) => setEditConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              {manageableIds.size > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">我的视频</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{manageableIds.size} 个</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center gap-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs sm:text-sm transition-colors"
                    >
                      {selectedVideoIds.size === manageableIds.size ? <CheckSquare size={14} /> : <Square size={14} />}
                      {selectedVideoIds.size > 0 ? `${selectedVideoIds.size} 已选` : '全选'}
                    </button>
                    {selectedVideoIds.size > 0 && (
                      <button
                        onClick={handleBatchDelete}
                        disabled={batchDeleteLoading}
                        className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-xs sm:text-sm transition-colors"
                      >
                        <Trash size={14} />
                        {batchDeleteLoading ? '删除中...' : '删除'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:p-4 bg-gray-50 dark:bg-gray-900">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={editLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm transition-colors"
              >
                <Save size={16} />
                {editLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
