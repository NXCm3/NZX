import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Upload as UploadIcon, X, Camera, Film, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { videoService } from '../services/storage';

export default function UploadVideo() {
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPermissionTip, setShowPermissionTip] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

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
                <strong>需要访问权限：</strong>点击下方按钮时，浏览器会请求访问您的相册/文件。请点击"允许"以选择视频和图片。
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                手机端：可以选择从相机拍摄或从相册选择
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                视频文件 *
              </label>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                className="hidden"
                id="video-upload"
              />
              {!videoFile ? (
                <div 
                  onClick={triggerVideoSelect}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 sm:p-8 text-center hover:border-blue-500 transition-colors cursor-pointer active:bg-blue-50 dark:active:bg-blue-900/10"
                >
                  <Film className="mx-auto text-gray-400 mb-3" size={48} />
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                    点击选择视频
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    支持从相册选择或相机拍摄
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    MP4, WebM, MOV 等格式
                  </p>
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
                id="thumbnail-upload"
              />
              {!thumbnailFile ? (
                <div 
                  onClick={triggerThumbnailSelect}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer active:bg-blue-50 dark:active:bg-blue-900/10"
                >
                  <ImageIcon className="mx-auto text-gray-400 mb-2" size={32} />
                  <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">
                    点击选择图片
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    从相册选择或相机拍摄
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={URL.createObjectURL(thumbnailFile)}
                      alt="预览"
                      className="w-16 h-16 object-cover rounded shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{thumbnailFile.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(thumbnailFile.size / 1024).toFixed(2)} KB
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
