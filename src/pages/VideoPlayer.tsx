import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, Send, Trash2, Reply } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService, commentService, onlineService } from '../services/storage';
import type { Video, Comment } from '../services/storage';

type Resolution = 'original' | '360p';

const resolutionOptions: { value: Resolution; label: string }[] = [
  { value: 'original', label: '原视频' },
  { value: '360p', label: '360P' },
];

const playbackSpeeds = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
];

// 根据分辨率获取视频 URL
const getTranscodedUrl = (originalUrl: string, resolution: string): string => {
  if (resolution === 'original') return originalUrl;
  
  // 生成转码版本的 URL（格式：原文件名_360p.扩展名）
  const urlParts = originalUrl.split('.');
  const extension = urlParts.pop();
  const baseUrl = urlParts.join('.');
  
  // 如果转码版本不存在，回退到原视频
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
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (id) {
      loadVideo(id);
      loadComments(id);

      // 每3秒轮询一次新评论(所有用户包括未登录)
      const commentInterval = setInterval(() => {
        loadComments(id!);
      }, 3000);

      // 更新在线状态(仅登录用户)
      let onlineInterval: number | null = null;
      if (user) {
        onlineService.updateActivity(user.id);
        onlineInterval = setInterval(() => {
          onlineService.updateActivity(user.id);
        }, 30000);
      }

      return () => {
        clearInterval(commentInterval);
        if (onlineInterval) {
          clearInterval(onlineInterval);
        }
      };
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
    if (confirm('确定要删除这条评论吗?')) {
      try {
        await commentService.delete(commentId);
        loadComments(id!);
      } catch (e: any) {
        alert('删除失败: ' + (e.message || e));
      }
    }
  };

  const canDeleteComment = (comment: Comment) => {
    if (!user) return false;
    // 管理员可以删除任何评论
    if (user.role === 'admin') return true;
    // 用户可以删除自己的评论
    if (user.username === comment.username) return true;
    return false;
  };

  if (!video) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
              返回首页
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 视频播放器 */}
          <div className="lg:col-span-2">
            <div className="bg-black rounded-xl overflow-hidden shadow-lg relative">
              <video
                ref={videoRef}
                src={selectedResolution === 'original' ? video.videoUrl : getTranscodedUrl(video.videoUrl, '360p')}
                controls
                autoPlay
                className="w-full aspect-video"
                playbackRate={playbackSpeed}
              >
                您的浏览器不支持视频播放
              </video>
            </div>
            
            {/* 视频下方的画质选择器 - 点击原画向上弹出360P选项 */}
            <div className="mt-3">
              <div className="relative inline-block">
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {selectedResolution === 'original' ? '原画' : '360P'}
                </button>
                
                {showMoreMenu && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-2 min-w-[100px] z-10 border border-gray-200 dark:border-gray-700">
                    <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      选择画质
                    </div>
                    {resolutionOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedResolution(option.value);
                          setShowMoreMenu(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between ${
                          selectedResolution === option.value 
                            ? 'text-blue-600 dark:text-blue-400 font-medium' 
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span>{option.label}</span>
                        {selectedResolution === option.value && (
                          <span className="text-blue-600 dark:text-blue-400">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {video.title}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {video.description}
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <span>上传者: {video.uploadedByName}</span>
                <span>•</span>
                <span>{new Date(video.uploadedAt).toLocaleDateString('zh-CN')}</span>
                <span>•</span>
                <span>{video.views} 次观看</span>
              </div>
            </div>
          </div>

          {/* 评论区 */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 sticky top-24">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageCircle size={20} />
                评论 ({comments.length})
              </h2>

              {/* 添加评论 */}
              <div className="mb-6">
                {replyingTo && (
                  <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                    <span className="text-sm text-blue-600 dark:text-blue-400">
                      回复: {comments.find(c => c.id === replyingTo)?.username}
                    </span>
                    <button
                      onClick={cancelReply}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      ×
                    </button>
                  </div>
                )}
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={user ? (replyingTo ? "写下你的回复..." : "写下你的评论...") : "登录后才能评论"}
                  rows={3}
                  disabled={!user}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!user || !newComment.trim()}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {replyingTo ? '发送回复' : '发表评论'}
                </button>
              </div>

              {/* 评论列表 */}
              <div className="space-y-4 max-h-[500px] overflow-y-auto scrollbar-thin">
                {comments.length > 0 ? (
                  comments.map((comment) => (
                    <motion.div
                      key={comment.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0 ${
                        comment.replyTo ? 'ml-4 pl-4 border-l-2 border-blue-300 dark:border-blue-700' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {comment.username}
                          </span>
                          {comment.replyToUsername && (
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                              回复 @{comment.replyToUsername}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(comment.createdAt).toLocaleString('zh-CN')}
                          </span>
                          {canDeleteComment(comment) && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 text-sm mb-2">
                        {comment.content}
                      </p>
                      {user && (
                        <button
                          onClick={() => handleReply(comment.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                        >
                          <Reply size={12} />
                          回复
                        </button>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    暂无评论,快来发表第一条评论吧!
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
