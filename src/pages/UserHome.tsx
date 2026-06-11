import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video as VideoIcon, X, Save, CheckSquare, Square, Trash } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, onlineService, userService } from '../services/storage';
import type { Video } from '../services/storage';
import Header from '../components/Layout/Header';
import VideoCard from '../components/VideoCard';
import UserCard from '../components/UserCard';

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
      {/* 顶部导航 */}
      <Header />

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 用户功能卡片 */}
        {user && (
          <UserCard onSettings={() => setShowSettings(true)} />
        )}

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
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
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm transition-colors"
              >
                {selectedVideoIds.size === manageableIds.size ? <CheckSquare size={16} /> : <Square size={16} />}
                {selectedVideoIds.size > 0 ? `${selectedVideoIds.size}/${manageableIds.size}` : '全选'}
              </button>
              {selectedVideoIds.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  disabled={batchDeleteLoading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-sm transition-colors"
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
            {videos.map((video) => (
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
