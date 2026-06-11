import React from 'react';
import { motion } from 'framer-motion';
import { Trash2, CheckSquare, Square, Play, Tag } from 'lucide-react';
import type { Video } from '../services/storage';
import { withVersionBuster } from '../utils/version';

interface VideoCardProps {
  video: Video;
  manageable?: boolean;
  selected?: boolean;
  showCheckbox?: boolean;
  onClick?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onSelect?: (e: React.MouseEvent) => void;
}

export default function VideoCard({
  video,
  manageable = false,
  selected = false,
  showCheckbox = false,
  onClick,
  onDelete,
  onSelect,
}: VideoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-200 group relative active:scale-[0.98] ${
        selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''
      }`}
    >
      {/* 缩略图 - 固定比例 */}
      <div className="relative w-full bg-gray-100 dark:bg-gray-700" style={{ aspectRatio: '16 / 10' }}>
        <img
          src={withVersionBuster(video.thumbnail)}
          alt={video.title}
          className="w-full h-full object-cover object-center"
          loading="lazy"
        />

        {/* 播放按钮 - hover 显示 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <div className="w-12 h-12 bg-white/90 dark:bg-gray-800/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 shadow-xl">
            <Play size={22} className="text-blue-600 ml-1" />
          </div>
        </div>

        {/* 选择框 */}
        {showCheckbox && manageable && (
          <button
            onClick={onSelect}
            className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform ${
              selected
                ? 'bg-blue-600 text-white'
                : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 opacity-70 group-hover:opacity-100'
            }`}
          >
            {selected ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        )}

        {/* 删除按钮 */}
        {manageable && (
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 w-8 h-8 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform"
          >
            <Trash2 size={16} />
          </button>
        )}

        {/* 观看次数 */}
        <div className="absolute bottom-2 right-2 bg-black/70 dark:bg-black/80 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
          <span>👁</span>
          <span>{video.views}</span>
        </div>
      </div>

      {/* 标题和标签 */}
      <div className="p-2.5 sm:p-3">
        <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-sm leading-snug">
          {video.title}
        </h3>
        {/* 标签 */}
        {video.tags && video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {video.tags.slice(0, 2).map((tag: string) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md text-[11px] sm:text-xs"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
            {video.tags.length > 2 && (
              <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-md text-[11px] sm:text-xs">
                +{video.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
