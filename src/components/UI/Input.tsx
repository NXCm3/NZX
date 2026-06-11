import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** 输入框标签 */
  label?: string;
  /** 错误信息 */
  error?: string;
  /** 帮助文本 */
  helpText?: string;
}

export default function Input({
  label,
  error,
  helpText,
  className = '',
  ...props
}: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2.5 border rounded-lg
          bg-white dark:bg-gray-900
          text-gray-900 dark:text-white
          focus:outline-none focus:ring-2 focus:ring-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error 
            ? 'border-red-500 dark:border-red-500' 
            : 'border-gray-300 dark:border-gray-600'
          }
          ${className}
        `}
        {...props}
      />
      {helpText && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helpText}</p>
      )}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
