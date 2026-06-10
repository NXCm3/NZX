import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Upload as UploadIcon, X, Camera, Film, Image as ImageIcon, AlertCircle, FolderOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService } from '../services/storage';

export default function UploadVideo() {
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [autoThumbnail, setAutoThumbnail] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPermissionTip, setShowPermissionTip] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const videoCameraInputRef = useRef<HTMLInputElement>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailCameraInputRef = useRef<HTMLInputElement>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);

  // 如果没有登录,重定向到登录页
  if (!user) {
    navigate('/login');
    return null;
  }

  const handleUpload = async () => {
    if (!videoTitle || !videoFile) {
      alert('请填写标题并选择视频文件');
      return;
    }

    setUploading(true);

    try {
      // 将文件转换为base64
      const videoBase64 = await fileToBase64(videoFile);
      let thumbnailBase64 = '';
      
      if (thumbnailFile) {
        thumbnailBase64 = await fileToBase64(thumbnailFile);
      } else if (autoThumbnail) {
        // 使用自动提取的视频第一帧
        thumbnailBase64 = autoThumbnail;
      } else {
        // 如果没有缩略图,使用默认图片
        thumbnailBase64 = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop';
      }

      videoService.add({
        title: videoTitle,
        description: videoDescription,
        thumbnail: thumbnailBase64,
        videoUrl: videoBase64,
        uploadedBy: user.id,
        uploadedByName: user.username,
      });

      alert('视频上传成功');
      navigate('/');
    } catch (err) {
      alert('视频上传失败,请重试');
    } finally {
      setUploading(false);
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
        // 跳转到第一帧
        video.currentTime = 0.1;
      };
      
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(url);
          resolve(thumbnail);
        } else {
          URL.revokeObjectURL(url);
          reject(new Error('无法创建canvas上下文'));
        }
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('视频加载失败'));
      };
    });
  };

  const handleVideoSelect = async (file: File | null, isFromCamera: boolean = false) => {
    if (!file) return;
    setVideoFile(file);
    
    // 如果没有手动设置缩略图,自动提取视频第一帧
    if (!thumbnailFile) {
      try {
        const thumbnail = await extractVideoThumbnail(file);
        setAutoThumbnail(thumbnail);
      } catch (err) {
        console.error('提取视频封面失败:', err);
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
      {/* 顶部导航 */}
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
            <h1 className="ml-4 text-xl font-bold text-gray-900 dark:text-white">
              上传视频
            </h1>
          </div>
        </div>
      </header>

      {/* 权限提示 */}
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
                <strong>需要访问权限：</strong>点击下方按钮时，浏览器会请求访问您的相机或相册。请点击"允许"以选择文件。
              </p>
            </div>
            <button
              onClick={() => setShowPermissionTip(false)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
            >
              <X size={18} />
            </button>
          </div>
        </motion.div>
      )}

      {/* 隐藏的视频元素用于提取封面 */}
      <video ref={videoElementRef} className="hidden" />

      {/* 主要内容 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-8"
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                视频标题 *
              </label>
              <input
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="请输入视频标题"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                视频描述
              </label>
              <textarea
                value={videoDescription}
                onChange={(e) => setVideoDescription(e.target.value)}
                placeholder="请输入视频描述(可选)"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                视频文件 *
              </label>
              
              {/* 隐藏的input */}
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handleVideoSelect(e.target.files?.[0] || null, false)}
                className="hidden"
              />
              <input
                ref={videoCameraInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                onChange={(e) => handleVideoSelect(e.target.files?.[0] || null, true)}
                className="hidden"
              />
              
              {!videoFile ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => videoCameraInputRef.current?.click()}
                    className="border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-4 text-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer"
                  >
                    <Camera className="mx-auto text-blue-500 mb-2" size={32} />
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">拍照录制</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">使用相机拍摄</p>
                  </button>
                  <button
                    onClick={() => videoFileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer"
                  >
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
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(videoFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearVideoFile}
                    className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 shrink-0 ml-2"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                缩略图 (可选)
              </label>
              
              {/* 隐藏的input */}
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
              />
              
              {!thumbnailFile && !autoThumbnail ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => thumbnailCameraInputRef.current?.click()}
                    className="border-2 border-dashed border-green-300 dark:border-green-700 rounded-lg p-4 text-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors cursor-pointer"
                  >
                    <Camera className="mx-auto text-green-500 mb-2" size={24} />
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">拍照</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">使用相机拍摄</p>
                  </button>
                  <button
                    onClick={() => thumbnailFileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="mx-auto text-gray-500 mb-2" size={24} />
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-sm">从文件选择</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">从相册选择</p>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={thumbnailFile ? URL.createObjectURL(thumbnailFile) : autoThumbnail || ''}
                      alt="预览"
                      className="w-16 h-16 object-cover rounded shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {thumbnailFile ? thumbnailFile.name : '视频第一帧(自动)'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {thumbnailFile ? `${(thumbnailFile.size / 1024).toFixed(2)} KB` : '自动生成'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearThumbnailFile}
                    className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 shrink-0 ml-2"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
              
              {autoThumbnail && !thumbnailFile && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  * 已自动使用视频第一帧作为封面，你也可以点击上方按钮自定义封面
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleUpload}
                disabled={uploading || !videoTitle || !videoFile}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-800"
              >
                <UploadIcon size={20} />
                {uploading ? '上传中...' : '确认上传'}
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors active:bg-gray-400 dark:active:bg-gray-500"
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
