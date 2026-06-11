import React from 'react';
import { motion } from 'framer-motion';
import { Trash2, CheckSquare, Square } from 'lucide-react';
import type { Video } from '../../services/storage';

interface VideoCardProps {
  video: Video;
  /** 是否可管理（删除/选择） */
  manageable?: boolean;
  /** 是否选中 */
  selected?: boolean;
  /** 是否显示选择框 */
  showCheckbox?: boolean;
  /** 点击事件 */
  onClick?: () => void;
  /** 删除事件 */
  onDelete?: (e: React.MouseEvent) => void;
  /** 选择事件 */
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-200 group relative"
    >
      {/* 缩略图 */}
      <div className="relative" style={{ aspectRatio: '4/3' }}>
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-contain bg-black"
        />
        
        {/* 选择框 */}
        {showCheckbox && manageable && (
          <button
            onClick={onSelect}
            className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
              selected
                ? 'bg-blue-600 text-white'
                : 'bg-white/80 text-gray-600 opacity-0 group-hover:opacity-100'
            }`}
            title={selected ? '取消选中' : '选中'}
          >
            {selected ? <CheckSquare size={14} /> : <Square size={14} />}
          </button>
        )}

        {/* 删除按钮 */}
        {manageable && (
          <button
            onClick={onDelete}
            className="absolute top-1 right-1 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除视频"
          >
            <Trash2 size={12} />
          </button>
        )}

        {/* 观看次数 */}
        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
          {video.views}
        </div>
      </div>

      {/* 标题 */}
      <div className="p-2">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 group-hover:text-blue-600 transition-colors text-xs">
          {video.title}
        </h3>
      </div>
    </motion.div>
  );
}
