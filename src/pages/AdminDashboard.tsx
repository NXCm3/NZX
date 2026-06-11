import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Video,
  LogOut,
  Plus,
  Trash2,
  Eye,
  Upload,
  CheckCircle,
  XCircle,
  UserPlus,
  AlertTriangle,
  Film,
  Image as ImageIcon,
  X,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, commentService, userService, onlineService, type User as AppUser } from '../services/storage';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'videos' | 'stats'>('stats');
  const [videos, setVideos] = useState<any[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // 表单状态
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    try {
      const vids = await videoService.getAll();
      setVideos(vids);
      const usrs = await userService.getAllIncludingAdmin();
      setUsers(usrs);
      const oc = await onlineService.getOnlineCount();
      setOnlineCount(oc);
      const total = vids.reduce((sum: number, v: any) => sum + (v.views || 0), 0);
      setTotalViews(total);
      if (user) {
        await onlineService.updateActivity(user.id);
      }
    } catch (e: any) {
      console.error('Refresh data error:', e);
    }
  };

  const handleLogout = async () => {
    if (user) {
      await onlineService.removeUser(user.id);
    }
    logout();
    navigate('/login');
  };

  const handleAddUser = async () => {
    if (!newUsername || !newPassword) {
      alert('请填写用户名和密码');
      return;
    }

    if (newPassword.length < 6) {
      alert('密码长度至少6位');
      return;
    }

    try {
      await userService.add({
        username: newUsername,
        password: newPassword,
        role: 'user',
      });
      setNewUsername('');
      setNewPassword('');
      setShowAddUser(false);
      refreshData();
      alert('用户添加成功');
    } catch (err: any) {
      alert(err.message || '添加失败');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (userId === 'admin-001') {
      alert('不能删除管理员账号');
      return;
    }
    if (confirm(`确定要删除用户 "${username}" 吗?\n该用户上传的所有视频也会被删除。`)) {
      try {
        await userService.delete(userId);
        refreshData();
        alert('用户已删除');
      } catch (err: any) {
        alert(err.message || '删除失败');
      }
    }
  };

  const handleToggleRole = async (u: AppUser) => {
    const isAdmin = u.role === 'admin';
    const targetRole: 'admin' | 'user' = isAdmin ? 'user' : 'admin';
    const msg = isAdmin
      ? `确定要将 "${u.username}" 降级为普通用户吗?`
      : `确定要将 "${u.username}" 升级为管理员吗?`;
    if (!confirm(msg)) return;
    try {
      await userService.update(u.id, { role: targetRole });
      refreshData();
      alert('角色已更新');
    } catch (err: any) {
      alert(err.message || '更新失败');
    }
  };

  const handleAddVideo = async () => {
    if (!videoTitle || !videoFile) {
      alert('请填写标题并选择视频文件');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', videoFile);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('视频上传失败');
      const videoInfo = await res.json();

      let thumbnailUrl = videoInfo.url;
      if (thumbnailFile) {
        const td = new FormData();
        td.append('file', thumbnailFile);
        const tres = await fetch('/api/upload', {
          method: 'POST',
          body: td,
        });
        if (tres.ok) {
          const tinfo = await tres.json();
          thumbnailUrl = tinfo.url;
        }
      } else {
        thumbnailUrl = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop';
      }

      await videoService.add({
        title: videoTitle,
        description: videoDescription,
        thumbnail: thumbnailUrl,
        videoUrl: videoInfo.url,
        uploadedBy: user?.id || '',
        uploadedByName: user?.username || 'admin',
      });

      setVideoTitle('');
      setVideoDescription('');
      setVideoFile(null);
      setThumbnailFile(null);
      setShowAddVideo(false);
      refreshData();
      alert('视频上传成功');
    } catch (err) {
      alert('视频上传失败: ' + (err as any).message);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (confirm('确定要删除该视频吗?相关评论也会被删除。')) {
      try {
        await videoService.delete(videoId);
        refreshData();
      } catch (e: any) {
        alert('删除失败: ' + (e.message || e));
      }
    }
  };

  const handleSelectVideo = (videoId: string) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideos(newSelected);
  };

  const handleSelectAllVideos = () => {
    if (selectedVideos.size === videos.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(videos.map(v => v.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedVideos.size === 0) {
      alert('请先选择要删除的视频');
      return;
    }
    if (confirm(`确定要删除选中的 ${selectedVideos.size} 个视频吗?`)) {
      try {
        await videoService.deleteMultiple(Array.from(selectedVideos));
        setSelectedVideos(new Set());
        refreshData();
        alert('批量删除成功');
      } catch (e: any) {
        alert('批量删除失败: ' + (e.message || e));
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const clearVideoFile = () => {
    setVideoFile(null);
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  const clearThumbnailFile = () => {
    setThumbnailFile(null);
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = '';
    }
  };

  const triggerVideoSelect = () => {
    videoInputRef.current?.click();
  };

  const triggerThumbnailSelect = () => {
    thumbnailInputRef.current?.click();
  };

  const getUserVideoCount = (username: string) => {
    return videos.filter(v => v.uploadedByName === username).length;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="hidden sm:inline">返回首页</span>
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                管理员后台
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-600 dark:text-gray-400">
                欢迎, {user?.username}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">退出登录</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 标签页导航 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'stats'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            数据统计
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'users'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            用户管理
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'videos'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            视频管理
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">在线人数</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    {onlineCount}
                  </p>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                  <Users className="text-green-600 dark:text-green-400" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">视频总数</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    {videos.length}
                  </p>
                </div>
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                  <Video className="text-blue-600 dark:text-blue-400" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">总观看次数</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    {totalViews}
                  </p>
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full">
                  <Eye className="text-purple-600 dark:text-purple-400" size={24} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                用户列表
              </h2>
              <button
                onClick={() => setShowAddUser(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <UserPlus size={18} />
                添加用户
              </button>
            </div>

            {showAddUser && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  添加新用户
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="用户名"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                  <input
                    type="password"
                    placeholder="密码(至少6位)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleAddUser}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    确认添加
                  </button>
                  <button
                    onClick={() => setShowAddUser(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      用户名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      角色
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      视频数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      最后登录
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white">
                        {u.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          u.role === 'admin'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {u.role === 'admin' ? '管理员' : '普通用户'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {u.id === 'admin-001' ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle size={14} />
                            永久在线
                          </span>
                        ) : u.isOnline ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle size={14} />
                            在线
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                            <XCircle size={14} />
                            离线
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {getUserVideoCount(u.username)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {u.id === 'admin-001' ? '-' : new Date(u.lastSeen).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex gap-3 items-center justify-end">
                          {u.role === 'admin' ? (
                            u.id !== 'admin-001' && (
                              <button
                                onClick={() => handleToggleRole(u)}
                                className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300"
                                title="降级为普通用户"
                              >
                                <AlertTriangle size={18} />
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => handleToggleRole(u)}
                              className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                              title="升级为管理员"
                            >
                              <UserPlus size={18} />
                            </button>
                          )}
                          {u.id !== 'admin-001' && (
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              title="删除用户"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'videos' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                视频列表
              </h2>
              <div className="flex gap-2">
                {selectedVideos.size > 0 && (
                  <button
                    onClick={handleBatchDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                    批量删除 ({selectedVideos.size})
                  </button>
                )}
                <button
                  onClick={() => setShowAddVideo(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Upload size={18} />
                  上传视频
                </button>
              </div>
            </div>

            {showAddVideo && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  上传新视频
                </h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="视频标题"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                  <textarea
                    placeholder="视频描述"
                    value={videoDescription}
                    onChange={(e) => setVideoDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />

                  {/* 视频文件选择 - 支持手机端 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      视频文件
                    </label>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      capture="environment"
                      onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="admin-video-upload"
                    />
                    {!videoFile ? (
                      <div
                        onClick={() => videoInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
                      >
                        <Film className="mx-auto text-gray-400 mb-2" size={32} />
                        <p className="text-gray-600 dark:text-gray-400 text-sm">点击选择视频或从相机拍摄</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Film className="text-blue-600 shrink-0" size={20} />
                          <span className="text-sm text-gray-900 dark:text-white truncate">{videoFile.name}</span>
                        </div>
                        <button onClick={clearVideoFile} className="text-gray-500 hover:text-red-600 shrink-0 ml-2">
                          <X size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 缩略图选择 - 支持手机端 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      缩略图 (可选)
                    </label>
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="admin-thumbnail-upload"
                    />
                    {!thumbnailFile ? (
                      <div
                        onClick={() => thumbnailInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-500 transition-colors cursor-pointer"
                      >
                        <ImageIcon className="mx-auto text-gray-400 mb-1" size={24} />
                        <p className="text-gray-600 dark:text-gray-400 text-xs">点击选择图片或从相机拍摄</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <img src={URL.createObjectURL(thumbnailFile)} alt="预览" className="w-12 h-12 object-cover rounded shrink-0" />
                          <span className="text-sm text-gray-900 dark:text-white truncate">{thumbnailFile.name}</span>
                        </div>
                        <button onClick={clearThumbnailFile} className="text-gray-500 hover:text-red-600 shrink-0 ml-2">
                          <X size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleAddVideo}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    确认上传
                  </button>
                  <button
                    onClick={() => setShowAddVideo(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 全选按钮 */}
            {videos.length > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedVideos.size === videos.length && videos.length > 0}
                  onChange={handleSelectAllVideos}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  全选 ({selectedVideos.size}/{videos.length})
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <div key={video.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                  <div className="relative">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-48 object-cover"
                    />
                    <input
                      type="checkbox"
                      checked={selectedVideos.has(video.id)}
                      onChange={() => handleSelectVideo(video.id)}
                      className="absolute top-2 left-2 w-5 h-5 text-blue-600 rounded"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {video.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                      {video.description}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      上传者: {video.uploadedByName}
                    </p>
                    <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{video.views} 次观看</span>
                      <button
                        onClick={() => handleDeleteVideo(video.id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {videos.length === 0 && (
              <div className="text-center py-12">
                <Video className="mx-auto text-gray-400" size={48} />
                <p className="mt-4 text-gray-600 dark:text-gray-400">
                  暂无视频,点击"上传视频"添加第一个视频
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
