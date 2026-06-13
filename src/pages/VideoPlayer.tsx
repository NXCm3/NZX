import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, Trash2, Reply, X, Play, Palette, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, commentService } from '../services/storage';
import type { Video, Comment } from '../services/storage';
import Header from '../components/Layout/Header';
import { withVersionBuster } from '../utils/version';

// 画质选项：原视频画质 + 360P + 160P
const QUALITY_LABELS: Record<string, string> = {
  original: '原视频画质',
  '360p': '360P 流畅',
  '160p': '160P 极速',
};

// 根据画质生成视频 URL
// 如果没有独立的转码版本，则使用原始视频 URL（保证可播放）
function getVideoUrlForQuality(baseUrl: string, quality: string): string {
  // 使用稳定版本号防缓存
  const stableUrl = withVersionBuster(baseUrl);
  // original 不添加画质参数，直接播放原始视频
  // 360p 添加参数供后端识别转码
  if (quality !== 'original') {
    const separator = stableUrl.includes('?') ? '&' : '?';
    return stableUrl + separator + 'quality=' + quality;
  }
  return stableUrl;
}

export default function VideoPlayer() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // 当前选择的画质
  const [quality, setQuality] = useState<string>('original');
  // 画质选择菜单是否展开
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  // 视频状态：加载中、播放、暂停、错误
  const [videoStatus, setVideoStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // 加载用户保存的画质偏好
  useEffect(() => {
    const savedQuality = localStorage.getItem('pref_quality');
    if (savedQuality) setQuality(savedQuality);
  }, []);

  // 保存画质设置
  const handleQualityChange = (qualityId: string) => {
    setQuality(qualityId);
    localStorage.setItem('pref_quality', qualityId);
    setShowQualityMenu(false);
    // 切换画质后重新加载视频（保留当前播放位置）
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      const wasPlaying = !videoRef.current.paused;
      videoRef.current.src = getVideoUrlForQuality(video?.videoUrl || '', qualityId);
      videoRef.current.load();
      if (wasPlaying) {
        videoRef.current.play().catch(() => {});
      }
      videoRef.current.currentTime = currentTime;
    }
  };

  useEffect(() => {
    if (id) {
      loadVideo(id);
      loadComments(id);
      const commentInterval = setInterval(() => {
        loadComments(id!);
      }, 5000);
      return () => clearInterval(commentInterval);
    }
  }, [id]);

  const loadVideo = async (videoId: string) => {
    try {
      const foundVideo = await videoService.getById(videoId);
      if (foundVideo) {
        setVideo(foundVideo);
        videoService.incrementViews(videoId);
        setVideoStatus('loading');
      } else {
        navigate(-1);
      }
    } catch (e: any) {
      console.error('加载视频失败:', e);
      navigate(-1);
    }
  };

  const loadComments = async (videoId: string) => {
    try {
      const videoComments = await commentService.getByVideoId(videoId);
      setComments(videoComments.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (e: any) {
      console.error('加载评论失败:', e);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user || !id) return;
    const commentData: any = {
      videoId: id,
      username: user.username,
      content: newComment.trim(),
    };
    if (replyingTo) {
      const parent = comments.find(c => c.id === replyingTo);
      if (parent) {
        commentData.replyTo = replyingTo;
        commentData.replyToUsername = parent.username;
      }
    }
    try {
      await commentService.add(commentData);
      setNewComment('');
      setReplyingTo(null);
      loadComments(id);
    } catch (e: any) {
      alert('评论失败: ' + (e.message || e));
    }
  };

  const canDeleteComment = (comment: Comment) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.username === comment.username) return true;
    return false;
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('确定要删除这条评论吗?')) return;
    try {
      await commentService.delete(commentId);
      loadComments(id!);
    } catch (e: any) {
      alert('删除失败: ' + (e.message || e));
    }
  };

  if (!video) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="视频播放" showBack />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* 视频播放器 + 信息区 */}
          <div className="lg:col-span-2">
            {/* 视频播放器 */}
            <div className="bg-black rounded-2xl overflow-hidden shadow-xl relative">
              <video
                ref={videoRef}
                key={video.id + '-' + quality}
                src={getVideoUrlForQuality(video.videoUrl, quality)}
                controls
                playsInline
                preload="auto"
                webkit-playsinline="true"
                className="w-full aspect-video bg-black"
                onLoadedData={() => setVideoStatus('ready')}
                onError={() => setVideoStatus('error')}
              >
                您的浏览器不支持视频播放
              </video>

              {/* 加载提示覆盖层 */}
              <AnimatePresence>
                {videoStatus === 'loading' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none"
                  >
                    <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mb-3" />
                    <p className="text-white text-sm">视频加载中...</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 错误提示覆盖层 */}
              <AnimatePresence>
                {videoStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-4"
                  >
                    <p className="text-white text-sm sm:text-base text-center mb-3">
                      当前画质无法播放，请尝试切换其他画质
                    </p>
                    <button
                      onClick={() => handleQualityChange('original')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-xl"
                    >
                      切换到原视频画质
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 画质选择器（视频下方） */}
            <div className="mt-3 sm:mt-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2 relative">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Palette size={18} className="text-blue-600 shrink-0" />
                  <span className="text-sm sm:text-base text-gray-700 dark:text-gray-300">当前画质：</span>
                  <span className="text-sm sm:text-base font-semibold text-blue-600 dark:text-blue-400">
                    {QUALITY_LABELS[quality] || quality}
                  </span>
                </div>

                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl text-sm font-medium transition-colors active:scale-95 shrink-0"
                >
                  切换画质
                  <ChevronDown size={14} className={`transition-transform ${showQualityMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* 画质选择下拉菜单 */}
                <AnimatePresence>
                  {showQualityMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute right-0 top-full mt-2 w-full sm:w-60 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-20"
                    >
                      {Object.entries(QUALITY_LABELS).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => handleQualityChange(key)}
                          className={`w-full flex items-center justify-between p-3 sm:p-4 text-left transition-colors ${
                            quality === key
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="text-sm sm:text-base font-medium">{label}</span>
                          {quality === key && (
                            <span className="text-blue-600 text-xs font-medium">当前</span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 视频信息 */}
            <div className="mt-3 sm:mt-4 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">
                {video.title}
              </h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
                {video.description}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                <span>👤 {video.uploadedByName}</span>
                <span className="hidden sm:inline">•</span>
                <span>📅 {new Date(video.uploadedAt).toLocaleDateString('zh-CN')}</span>
                <span className="hidden sm:inline">•</span>
                <span>👁 {video.views} 次观看</span>
              </div>
              {/* 标签 */}
              {video.tags && video.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {video.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 评论区 */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageCircle size={20} />
                评论 ({comments.length})
              </h2>

              {/* 添加评论 */}
              <div className="mb-5">
                {replyingTo && (
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex justify-between items-center">
                    <span className="text-sm text-blue-600 dark:text-blue-400 truncate mr-2">
                      回复: {comments.find(c => c.id === replyingTo)?.username}
                    </span>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 shrink-0 p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={user ? (replyingTo ? "写下你的回复..." : "写下你的评论...") : "登录后才能评论"}
                  rows={3}
                  disabled={!user}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!user || !newComment.trim()}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium active:scale-95"
                >
                  <Send size={18} />
                  {replyingTo ? '发送回复' : '发表评论'}
                </button>
              </div>

              {/* 评论列表 */}
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {comments.length > 0 ? (
                  comments.map((comment) => (
                    <motion.div
                      key={comment.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0 ${
                        comment.replyTo ? 'ml-2 sm:ml-4 pl-3 sm:pl-4 border-l-2 border-blue-200 dark:border-blue-700' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-gray-900 dark:text-white text-sm">
                            {comment.username}
                          </span>
                          {comment.replyToUsername && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 block sm:inline">
                              回复 @{comment.replyToUsername}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(comment.createdAt).toLocaleString('zh-CN', {
                              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          {canDeleteComment(comment) && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-red-500 hover:text-red-700 dark:text-red-400 p-1 active:scale-90 transition-transform"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 text-sm mb-2 break-words leading-relaxed">
                        {comment.content}
                      </p>
                      {user && (
                        <button
                          onClick={() => setReplyingTo(comment.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 font-medium"
                        >
                          <Reply size={14} />
                          回复
                        </button>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm">
                    暂无评论，快来发表第一条评论吧！
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
