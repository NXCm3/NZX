import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮变体 */
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'gray';
  /** 按钮尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否显示加载状态 */
  loading?: boolean;
  /** 图标 */
  icon?: React.ReactNode;
  /** 子元素 */
  children?: React.ReactNode;
}

const variantStyles = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  success: 'bg-green-600 hover:bg-green-700 text-white',
  gray: 'bg-gray-600 hover:bg-gray-700 text-white',
};

const sizeStyles = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors
        disabled:opacity-60 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <span className="animate-spin">{icon}</span>
      ) : (
        icon
      )}
      {children && <span>{children}</span>}
    </button>
  );
}
