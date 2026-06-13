import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, CheckSquare, Square, ArrowLeft, Video as VideoIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService } from '../services/storage';
import type { Video } from '../services/storage';
import { withVersionBuster } from '../utils/version';

export default function DeleteVideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // 加载视频列表
  const loadVideos = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const allVideos = await videoService.getAll();
      setVideos(allVideos);
      setLoadError(null);
    } catch (e: any) {
      console.error('加载视频失败:', e);
      if (!silent) setLoadError('网络连接失败，请检查网络后重试');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVideos();
  }, []);

  // 当前用户可管理的视频：管理员可管理全部，普通用户只能管理自己上传的
  const manageableVideos = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return videos;
    return videos.filter(v => v.uploadedByName === user.username);
  }, [videos, user]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === manageableVideos.length && manageableVideos.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(manageableVideos.map(v => v.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个视频吗？删除后无法恢复。`)) return;

    setDeleteLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const id of Array.from(selectedIds)) {
        try {
          await videoService.delete(id);
          successCount++;
        } catch {
          failCount++;
        }
      }
      setSelectedIds(new Set());
      await loadVideos(true);
      if (failCount > 0) {
        alert(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
      } else {
        alert(`成功删除 ${successCount} 个视频`);
      }
    } catch (e: any) {
      alert('删除失败：' + (e.message || e));
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate('/');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
            >
              <ArrowLeft size={18} />
              <span>返回</span>
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate">
              视频管理（{manageableVideos.length}）
            </h1>
            <div className="w-[60px] sm:w-[80px]" />
          </div>
        </div>
      </div>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* 操作栏 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                disabled={manageableVideos.length === 0 || deleteLoading}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95 disabled:opacity-50"
              >
                {selectedIds.size === manageableVideos.length && manageableVideos.length > 0 ? (
                  <><CheckSquare size={18} /> 取消全选</>
                ) : (
                  <><Square size={18} /> {user.role === 'admin' ? '全选' : '全选我的视频'}</>
                )}
              </button>
            </div>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0 || deleteLoading}
              className="flex items-center gap-1.5 px-3 sm:px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors active:scale-95 disabled:opacity-40"
            >
              <Trash2 size={18} />
              <span>{deleteLoading ? '删除中...' : `删除选中 (${selectedIds.size})`}</span>
            </button>
          </div>
        </div>

        {/* 网络错误 */}
        {loadError && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h4 className="font-semibold text-red-700 dark:text-red-400 text-sm">网络连接失败</h4>
                <p className="mt-1 text-sm text-red-600 dark:text-red-500">{loadError}</p>
              </div>
              <button
                onClick={() => loadVideos(false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl active:scale-95"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {/* 视频列表（带多选） */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : manageableVideos.length === 0 ? (
          <div className="text-center py-16 sm:py-20 bg-white dark:bg-gray-800 rounded-2xl">
            <VideoIcon className="mx-auto text-gray-400" size={56} />
            <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
              {user.role === 'admin' ? '暂无视频' : '你还没有上传视频'}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {user.role === 'admin' ? '上传第一个视频开始分享' : '等待管理员上传视频后，你可以通过主页观看'}
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3"
          >
            {manageableVideos.map((video) => {
              const selected = selectedIds.has(video.id);
              return (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => toggleSelect(video.id)}
                  className={`bg-white dark:bg-gray-800 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-200 group relative active:scale-[0.98] ${
                    selected ? 'ring-2 ring-red-500 ring-offset-2 dark:ring-offset-gray-900' : ''
                  }`}
                >
                  {/* 缩略图 */}
                  <div className="relative w-full bg-gray-100 dark:bg-gray-700" style={{ aspectRatio: '16 / 10' }}>
                    <img
                      src={withVersionBuster(video.thumbnail)}
                      alt={video.title}
                      className="w-full h-full object-cover object-center"
                      loading="lazy"
                    />
                    {/* 选择框 */}
                    <div className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center shadow-md ${
                      selected ? 'bg-red-600 text-white' : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300'
                    }`}>
                      {selected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>
                    {/* 观看次数 */}
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-lg">
                      👁 {video.views}
                    </div>
                  </div>
                  {/* 标题 */}
                  <div className="p-2.5 sm:p-3">
                    <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2 text-sm leading-snug">
                      {video.title}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      上传者: {video.uploadedByName}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* 底部操作栏（手机端） */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-4 left-4 right-4 sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:mt-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  已选 <span className="font-bold text-red-600">{selectedIds.size}</span> 个视频
                </p>
                <button
                  onClick={handleBatchDelete}
                  disabled={deleteLoading}
                  className="flex-1 sm:flex-none sm:px-8 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors active:scale-95 disabled:opacity-50"
                >
                  <Trash2 size={18} />
                  {deleteLoading ? '删除中...' : '删除选中'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
