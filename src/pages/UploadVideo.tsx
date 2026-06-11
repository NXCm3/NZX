import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload as UploadIcon, X, Camera, Film, Image as ImageIcon, AlertCircle, FolderOpen, Loader2, CheckCircle2, Plus, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService } from '../services/storage';
import Header from '../components/Layout/Header';

const MAX_TAGS = 5;

export default function UploadVideo() {
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [autoThumbnail, setAutoThumbnail] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showPermissionTip, setShowPermissionTip] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const videoCameraInputRef = useRef<HTMLInputElement>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailCameraInputRef = useRef<HTMLInputElement>(null);

  // 添加标签
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      alert(`最多只能添加 ${MAX_TAGS} 个标签`);
      return;
    }
    setTags([...tags, trimmed]);
    setTagInput('');
  };

  // 删除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  // 回车添加标签
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  // 分片上传配置
  const CHUNK_SIZE = 20 * 1024 * 1024;

  // 防缓存的 fetch 包装：添加时间戳和防缓存头，解决手机端缓存问题
  const noCacheFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const cacheBuster = `${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    return fetch(url + cacheBuster, {
      ...options,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        ...(options.headers || {}),
      } as any,
    });
  };

  const uploadToR2 = async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
    const ext = file.name.split('.').pop() || '';
    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const filename = `${fileId}.${ext}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 创建上传会话
    const sessionRes = await noCacheFetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, fileSize: file.size, totalChunks }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({}));
      throw new Error(`创建上传会话失败: ${err.error || '未知错误'}`);
    }

    const { uploadId } = await sessionRes.json();

    // 上传所有分片
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('file', chunk, `chunk-${chunkIndex}`);
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', String(chunkIndex));
      formData.append('totalChunks', String(totalChunks));

      const chunkRes = await noCacheFetch('/api/upload/chunk', {
        method: 'POST',
        body: formData,
      });

      if (!chunkRes.ok) {
        const err = await chunkRes.json().catch(() => ({}));
        throw new Error(`上传分片 ${chunkIndex + 1} 失败: ${err.error || '未知错误'}`);
      }

      if (onProgress) {
        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        onProgress(progress);
      }
    }

    // 合并分片
    const mergeRes = await noCacheFetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, filename, totalChunks }),
    });

    if (!mergeRes.ok) {
      const err = await mergeRes.json().catch(() => ({}));
      throw new Error(`合并分片失败: ${err.error || '未知错误'}`);
    }

    const { url } = await mergeRes.json();
    return url;
  };

  const handleUpload = async () => {
    if (!videoTitle || !videoFile) {
      alert('请填写标题并选择视频文件');
      return;
    }

    const maxSize = 10 * 1024 * 1024 * 1024;
    if (videoFile.size > maxSize) {
      alert('视频文件不能超过 10GB');
      return;
    }

    setUploading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);
    setErrorMessage('');

    try {
      setUploadStatus('uploading');
      const videoUrl = await uploadToR2(videoFile, (progress) => {
        setUploadProgress(progress);
      });

      let thumbnailUrl = '';
      if (thumbnailFile) {
        thumbnailUrl = await uploadToR2(thumbnailFile);
      } else if (autoThumbnail) {
        const response = await fetch(autoThumbnail);
        const blob = await response.blob();
        const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
        thumbnailUrl = await uploadToR2(file);
      } else {
        thumbnailUrl = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop';
      }

      setUploadStatus('success');
      setUploadProgress(100);

      await videoService.add({
        title: videoTitle,
        description: videoDescription,
        thumbnail: thumbnailUrl,
        videoUrl: videoUrl,
        uploadedBy: user.id,
        uploadedByName: user.username,
        tags: tags.length > 0 ? tags : undefined,
      });

      setTimeout(() => {
        alert('视频上传成功!');
        navigate('/');
      }, 1000);
    } catch (err: any) {
      setUploadStatus('error');
      setErrorMessage(err.message || '上传失败,请重试');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const extractVideoThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.playsInline = true;
      video.muted = true;
      const url = URL.createObjectURL(file);
      video.src = url;
      video.onloadeddata = () => {
        video.currentTime = 0.1;
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth || 640, 640);
        canvas.height = Math.min(video.videoHeight || 360, 360);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(url);
          resolve(thumbnail);
        } else {
          URL.revokeObjectURL(url);
          reject(new Error('无法创建canvas'));
        }
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('视频加载失败'));
      };
    });
  };

  const handleVideoSelect = async (file: File | null) => {
    if (!file) return;
    const maxSize = 10 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('视频文件不能超过 10GB');
      return;
    }
    setVideoFile(file);
    if (!thumbnailFile) {
      try {
        const thumbnail = await extractVideoThumbnail(file);
        setAutoThumbnail(thumbnail);
      } catch (err) {
        console.error('提取封面失败:', err);
        setAutoThumbnail(null);
      }
    }
  };

  const clearVideoFile = () => {
    setVideoFile(null);
    setAutoThumbnail(null);
    if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    if (videoCameraInputRef.current) videoCameraInputRef.current.value = '';
  };

  const clearThumbnailFile = () => {
    setThumbnailFile(null);
    setAutoThumbnail(null);
    if (thumbnailFileInputRef.current) thumbnailFileInputRef.current.value = '';
    if (thumbnailCameraInputRef.current) thumbnailCameraInputRef.current.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="上传视频" showBack />

      {showPermissionTip && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800"
        >
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-start gap-2">
            <AlertCircle className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={20} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                支持最大 10GB 的视频文件
              </p>
            </div>
            <button onClick={() => setShowPermissionTip(false)} className="text-blue-600 dark:text-blue-400 shrink-0 p-1 active:scale-90 transition-transform">
              <X size={18} />
            </button>
          </div>
        </motion.div>
      )}

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6 space-y-5 sm:space-y-6"
        >
          {/* 视频标题 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              视频标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="请输入视频标题"
              disabled={uploading}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-base"
            />
          </div>

          {/* 视频描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              视频描述
            </label>
            <textarea
              value={videoDescription}
              onChange={(e) => setVideoDescription(e.target.value)}
              placeholder="请输入视频描述（可选）"
              rows={3}
              disabled={uploading}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 text-base"
            />
          </div>

          {/* 标签 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              标签 <span className="text-gray-400 font-normal">（可选，最多5个）</span>
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl text-sm font-medium"
                >
                  <Tag size={12} />
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-blue-900 dark:hover:text-blue-100 ml-0.5"
                    disabled={uploading}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            {tags.length < MAX_TAGS && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="输入标签后按回车添加"
                  disabled={uploading}
                  maxLength={20}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-base"
                />
                <button
                  onClick={handleAddTag}
                  disabled={uploading || !tagInput.trim() || tags.length >= MAX_TAGS}
                  className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <Plus size={20} />
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              最多添加 {MAX_TAGS} 个标签，标签有助于用户搜索发现您的视频
            </p>
          </div>

          {/* 视频文件选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              视频文件 <span className="text-red-500">*</span>
            </label>

            <input
              ref={videoFileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleVideoSelect(e.target.files?.[0] || null)}
              className="hidden"
            />
            <input
              ref={videoCameraInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={(e) => handleVideoSelect(e.target.files?.[0] || null)}
              className="hidden"
            />

            {!videoFile ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  onClick={() => videoCameraInputRef.current?.click()}
                  disabled={uploading}
                  className="border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl p-4 sm:p-5 text-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <Camera className="mx-auto text-blue-500 mb-2" size={28} />
                  <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">拍摄视频</p>
                </button>
                <button
                  onClick={() => videoFileInputRef.current?.click()}
                  disabled={uploading}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 sm:p-5 text-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <FolderOpen className="mx-auto text-gray-500 mb-2" size={28} />
                  <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">从文件选择</p>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Film className="text-blue-600 shrink-0" size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{videoFile.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatFileSize(videoFile.size)}</p>
                  </div>
                </div>
                {!uploading && (
                  <button
                    onClick={clearVideoFile}
                    className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 shrink-0 p-2 active:scale-90 transition-transform"
                  >
                    <X size={22} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 缩略图选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              缩略图（可选）
            </label>

            <input
              ref={thumbnailFileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setThumbnailFile(file);
                if (file) setAutoThumbnail(null);
              }}
              className="hidden"
              disabled={uploading}
            />
            <input
              ref={thumbnailCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setThumbnailFile(file);
                if (file) setAutoThumbnail(null);
              }}
              className="hidden"
              disabled={uploading}
            />

            {(!thumbnailFile && !autoThumbnail) ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  onClick={() => thumbnailCameraInputRef.current?.click()}
                  disabled={uploading}
                  className="border-2 border-dashed border-green-300 dark:border-green-700 rounded-xl p-4 sm:p-5 text-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <Camera className="mx-auto text-green-500 mb-2" size={26} />
                  <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">拍照</p>
                </button>
                <button
                  onClick={() => thumbnailFileInputRef.current?.click()}
                  disabled={uploading}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 sm:p-5 text-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <FolderOpen className="mx-auto text-gray-500 mb-2" size={26} />
                  <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">从文件选择</p>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-xl gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={thumbnailFile ? URL.createObjectURL(thumbnailFile) : autoThumbnail || ''}
                    alt="预览"
                    className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                      {thumbnailFile ? thumbnailFile.name : '视频第一帧（自动）'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {thumbnailFile ? formatFileSize(thumbnailFile.size) : '自动生成'}
                    </p>
                  </div>
                </div>
                {!uploading && (
                  <button
                    onClick={clearThumbnailFile}
                    className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 shrink-0 p-2 active:scale-90 transition-transform"
                  >
                    <X size={22} />
                  </button>
                )}
              </div>
            )}

            {autoThumbnail && !thumbnailFile && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                * 已自动使用视频第一帧作为封面
              </p>
            )}
          </div>

          {/* 上传进度 */}
          <AnimatePresence>
            {uploadStatus !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-4 rounded-xl ${
                  uploadStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
                  uploadStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                  'bg-blue-50 dark:bg-blue-900/20'
                }`}
              >
                {uploadStatus === 'uploading' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Loader2 className="animate-spin text-blue-600" size={20} />
                      <span className="text-blue-800 dark:text-blue-300 font-medium text-sm">
                        上传中... {uploadProgress}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                        className="bg-blue-600 h-3 rounded-full"
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      大文件上传可能需要较长时间，请勿关闭页面
                    </p>
                  </div>
                )}

                {uploadStatus === 'success' && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 size={22} />
                    <span className="font-medium text-sm">上传成功！</span>
                  </div>
                )}

                {uploadStatus === 'error' && (
                  <div>
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1.5">
                      <X size={22} />
                      <span className="font-medium text-sm">上传失败</span>
                    </div>
                    <p className="text-sm text-red-500 dark:text-red-400">{errorMessage}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
            <button
              onClick={handleUpload}
              disabled={uploading || !videoTitle || !videoFile}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-base"
            >
              {uploading ? <Loader2 className="animate-spin" size={20} /> : <UploadIcon size={20} />}
              {uploading ? '上传中...' : '确认上传'}
            </button>
            <button
              onClick={() => navigate('/')}
              disabled={uploading}
              className="px-6 py-3.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors disabled:opacity-50 active:scale-95 text-base"
            >
              取消
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
