import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Upload as UploadIcon, X, Camera, Film, Image as ImageIcon, AlertCircle, FolderOpen, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService } from '../services/storage';

// R2 上传配置 (同域 Pages Functions)
const R2_UPLOAD_URL = '/api/upload';
const R2_PUBLIC_URL = 'https://pub-3300c5431c524c789f6aa30ae9bad4a9.r2.dev';

export default function UploadVideo() {
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
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

  if (!user) {
    navigate('/login');
    return null;
  }

  // 分片上传配置
  const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB 每片

  // 分片上传文件到 R2
  const uploadToR2 = async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
    console.log('[上传] 开始上传:', file.name, '大小:', (file.size / 1024 / 1024).toFixed(2) + 'MB');
    
    // 生成唯一文件名
    const ext = file.name.split('.').pop() || '';
    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const filename = `${fileId}.${ext}`;
    
    // 计算分片数
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    console.log('[上传] 分片数:', totalChunks, '每片:', (CHUNK_SIZE / 1024 / 1024).toFixed(0) + 'MB');
    
    // 创建上传会话
    console.log('[上传] 创建上传会话...');
    const sessionRes = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, fileSize: file.size, totalChunks }),
    });
    
    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({}));
      throw new Error(`创建上传会话失败: ${err.error || '未知错误'}`);
    }
    
    const { uploadId } = await sessionRes.json();
    console.log('[上传] 上传会话创建成功, uploadId:', uploadId);
    
    // 上传所有分片
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      console.log(`[上传] 上传分片 ${chunkIndex + 1}/${totalChunks}, 大小: ${(chunk.size / 1024 / 1024).toFixed(2)}MB`);
      
      const formData = new FormData();
      formData.append('file', chunk, `chunk-${chunkIndex}`);
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', String(chunkIndex));
      formData.append('totalChunks', String(totalChunks));
      
      const chunkRes = await fetch('/api/upload/chunk', {
        method: 'POST',
        body: formData,
      });
      
      if (!chunkRes.ok) {
        const err = await chunkRes.json().catch(() => ({}));
        throw new Error(`上传分片 ${chunkIndex + 1} 失败: ${err.error || '未知错误'}`);
      }
      
      // 更新进度
      if (onProgress) {
        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        onProgress(progress);
      }
      
      console.log(`[上传] 分片 ${chunkIndex + 1}/${totalChunks} 上传成功`);
    }
    
    // 合并分片
    console.log('[上传] 合并分片...');
    const mergeRes = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, filename, totalChunks }),
    });
    
    if (!mergeRes.ok) {
      const err = await mergeRes.json().catch(() => ({}));
      throw new Error(`合并分片失败: ${err.error || '未知错误'}`);
    }
    
    const { url } = await mergeRes.json();
    console.log('[上传] 上传完成, 文件URL:', url);
    
    return url;
  };

  const handleUpload = async () => {
    if (!videoTitle || !videoFile) {
      alert('请填写标题并选择视频文件');
      return;
    }

    // 检查文件大小 (10GB = 10 * 1024 * 1024 * 1024)
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
      // 上传视频到 R2
      setUploadStatus('uploading');
      const videoUrl = await uploadToR2(videoFile, (progress) => {
        setUploadProgress(progress);
      });

      // 上传缩略图到 R2
      let thumbnailUrl = '';
      if (thumbnailFile) {
        thumbnailUrl = await uploadToR2(thumbnailFile);
      } else if (autoThumbnail) {
        // 如果是自动提取的 base64 缩略图,转换为 blob 后上传
        const response = await fetch(autoThumbnail);
        const blob = await response.blob();
        const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
        thumbnailUrl = await uploadToR2(file);
      } else {
        thumbnailUrl = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop';
      }

      setUploadStatus('success');
      setUploadProgress(100);

      // 保存到数据库(只存 URL)
      await videoService.add({
        title: videoTitle,
        description: videoDescription,
        thumbnail: thumbnailUrl,
        videoUrl: videoUrl,
        uploadedBy: user.id,
        uploadedByName: user.username,
      });

      // 延迟跳转,让用户看到成功状态
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

  // 提取视频第一帧作为缩略图
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
    
    // 检查文件大小
    const maxSize = 10 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('视频文件不能超过 10GB');
      return;
    }
    
    setVideoFile(file);
    
    // 自动提取封面
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="hidden sm:inline">返回首页</span>
            </button>
            <h1 className="ml-4 text-xl font-bold text-gray-900 dark:text-white">上传视频</h1>
          </div>
        </div>
      </header>

      {showPermissionTip && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800"
        >
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-start gap-3">
            <AlertCircle className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>提示:</strong> 支持最大 10GB 的视频文件。大文件上传可能需要较长时间,请保持页面打开。
              </p>
            </div>
            <button onClick={() => setShowPermissionTip(false)} className="text-blue-600 dark:text-blue-400">
              <X size={18} />
            </button>
          </div>
        </motion.div>
      )}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-8"
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">视频标题 *</label>
              <input
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="请输入视频标题"
                disabled={uploading}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">视频描述</label>
              <textarea
                value={videoDescription}
                onChange={(e) => setVideoDescription(e.target.value)}
                placeholder="请输入视频描述(可选)"
                rows={3}
                disabled={uploading}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">视频文件 *</label>
              
              <input ref={videoFileInputRef} type="file" accept="video/*" onChange={(e) => handleVideoSelect(e.target.files?.[0] || null)} className="hidden" />
              <input ref={videoCameraInputRef} type="file" accept="video/*" capture="environment" onChange={(e) => handleVideoSelect(e.target.files?.[0] || null)} className="hidden" />
              
              {!videoFile ? (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => videoCameraInputRef.current?.click()} disabled={uploading} className="border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-4 text-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <Camera className="mx-auto text-blue-500 mb-2" size={32} />
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">拍照录制</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">使用相机拍摄</p>
                  </button>
                  <button onClick={() => videoFileInputRef.current?.click()} disabled={uploading} className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <FolderOpen className="mx-auto text-gray-500 mb-2" size={32} />
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">从文件选择</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">从相册选择</p>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Film className="text-blue-600 shrink-0" size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{videoFile.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{(videoFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button onClick={clearVideoFile} className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 shrink-0 ml-2">
                      <X size={20} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">缩略图 (可选)</label>
              
              <input ref={thumbnailFileInputRef} type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0] || null; setThumbnailFile(file); if (file) setAutoThumbnail(null); }} className="hidden" disabled={uploading} />
              <input ref={thumbnailCameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0] || null; setThumbnailFile(file); if (file) setAutoThumbnail(null); }} className="hidden" disabled={uploading} />
              
              {(!thumbnailFile && !autoThumbnail) ? (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => thumbnailCameraInputRef.current?.click()} disabled={uploading} className="border-2 border-dashed border-green-300 dark:border-green-700 rounded-lg p-4 text-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <Camera className="mx-auto text-green-500 mb-2" size={24} />
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">拍照</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">使用相机拍摄</p>
                  </button>
                  <button onClick={() => thumbnailFileInputRef.current?.click()} disabled={uploading} className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <FolderOpen className="mx-auto text-gray-500 mb-2" size={24} />
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">从文件选择</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">从相册选择</p>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img src={thumbnailFile ? URL.createObjectURL(thumbnailFile) : autoThumbnail || ''} alt="预览" className="w-16 h-16 object-cover rounded shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{thumbnailFile ? thumbnailFile.name : '视频第一帧(自动)'}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{thumbnailFile ? `${(thumbnailFile.size / 1024).toFixed(2)} KB` : '自动生成'}</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button onClick={clearThumbnailFile} className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 shrink-0 ml-2">
                      <X size={20} />
                    </button>
                  )}
                </div>
              )}
              
              {autoThumbnail && !thumbnailFile && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">* 已自动使用视频第一帧作为封面</p>
              )}
            </div>

            {/* 上传进度 */}
            <AnimatePresence>
              {uploadStatus !== 'idle' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`p-4 rounded-lg ${
                    uploadStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
                    uploadStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                    'bg-blue-50 dark:bg-blue-900/20'
                  }`}
                >
                  {uploadStatus === 'uploading' && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Loader2 className="animate-spin text-blue-600" size={20} />
                        <span className="text-blue-800 dark:text-blue-300 font-medium">上传中... {uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">大文件上传可能需要较长时间,请勿关闭页面</p>
                    </div>
                  )}
                  
                  {uploadStatus === 'success' && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 size={20} />
                      <span className="font-medium">上传成功!</span>
                    </div>
                  )}
                  
                  {uploadStatus === 'error' && (
                    <div>
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
                        <X size={20} />
                        <span className="font-medium">上传失败</span>
                      </div>
                      <p className="text-sm text-red-500 dark:text-red-400">{errorMessage}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleUpload}
                disabled={uploading || !videoTitle || !videoFile}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-800"
              >
                {uploading ? <Loader2 className="animate-spin" size={20} /> : <UploadIcon size={20} />}
                {uploading ? '上传中...' : '确认上传'}
              </button>
              <button
                onClick={() => navigate('/')}
                disabled={uploading}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
