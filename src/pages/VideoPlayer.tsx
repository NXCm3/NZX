import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, Trash2, Reply, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, commentService, onlineService } from '../services/storage';
import type { Video, Comment } from '../services/storage';
import Header from '../components/Layout/Header';
import { withCacheBuster } from '../utils/version';

type Resolution = 'original' | '360p';

const resolutionOptions: { value: Resolution; label: string }[] = [
  { value: 'original', label: '原画' },
  { value: '360p', label: '360P' },
];

// 根据分辨率获取视频 URL
const getTranscodedUrl = (originalUrl: string, resolution: string): string => {
  if (resolution === 'original') return originalUrl;
  const urlParts = originalUrl.split('.');
  const extension = urlParts.pop();
  const baseUrl = urlParts.join('.');
  return `${baseUrl}_${resolution}.${extension}`;
};

export default function VideoPlayer() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<Resolution>('original');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (id) {
      loadVideo(id);
      loadComments(id);
      const commentInterval = setInterval(() => {
        loadComments(id!);
      }, 3000);
      return () => clearInterval(commentInterval);
    }
  }, [id, user]);

  const loadVideo = async (videoId: string) => {
    try {
      const foundVideo = await videoService.getById(videoId);
      if (foundVideo) {
        setVideo(foundVideo);
        videoService.incrementViews(videoId);
      } else {
        navigate('/');
      }
    } catch (e: any) {
      console.error('加载视频失败:', e);
      navigate('/');
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
    if (!newComment.trim()) return;
    if (!user) {
      alert('请先登录才能评论');
      navigate('/login');
      return;
    }
    let commentData: any = {
      videoId: id!,
      username: user.username,
      content: newComment.trim(),
    };
    if (replyingTo) {
      const parentComment = comments.find(c => c.id === replyingTo);
      if (parentComment) {
        commentData.replyTo = replyingTo;
        commentData.replyToUsername = parentComment.username;
      }
    }
    try {
      await commentService.add(commentData);
      setNewComment('');
      setReplyingTo(null);
      loadComments(id!);
    } catch (e: any) {
      alert('评论失败: ' + (e.message || e));
    }
  };

  const handleReply = (commentId: string) => {
    if (!user) {
      alert('请先登录才能回复');
      navigate('/login');
      return;
    }
    setReplyingTo(commentId);
  };

  const cancelReply = () => {
    setReplyingTo(null);
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

  const canDeleteComment = (comment: Comment) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.username === comment.username) return true;
    return false;
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
      {/* 顶部导航 */}
      <Header title="视频播放" showBack />

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* 视频播放器 + 信息区 */}
          <div className="lg:col-span-2">
            {/* 视频播放器 */}
            <div className="bg-black rounded-2xl overflow-hidden shadow-xl relative">
              <video
                ref={videoRef}
                src={withCacheBuster(selectedResolution === 'original' ? video.videoUrl : getTranscodedUrl(video.videoUrl, '360p'))}
                controls
                autoPlay
                className="w-full aspect-video"
                playsInline
              >
                您的浏览器不支持视频播放
              </video>
            </div>

            {/* 画质选择器 */}
            <div className="mt-4 flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors whitespace-nowrap active:scale-95 flex items-center gap-2"
                >
                  {selectedResolution === 'original' ? '🎬 原画' : '📺 360P'}
                </button>

                <AnimatePresence>
                  {showMoreMenu && (
                    <>
                      {/* 点击空白处关闭菜单 */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowMoreMenu(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl py-1 min-w-[120px] z-20 border border-gray-200 dark:border-gray-700 overflow-hidden"
                      >
                        {resolutionOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSelectedResolution(option.value);
                              setShowMoreMenu(false);
                            }}
                            className={`w-full px-4 py-3 text-left text-sm transition-colors flex items-center justify-between ${
                              selectedResolution === option.value
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            <span>{option.label}</span>
                            {selectedResolution === option.value && (
                              <span className="text-blue-600 dark:text-blue-400">✓</span>
                            )}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 视频信息 */}
            <div className="mt-4 sm:mt-6 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm">
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
                      onClick={cancelReply}
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
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
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
                          onClick={() => handleReply(comment.id)}
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
