import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// 登录页 - 非受控组件实现，彻底避免 Android WebView 输入法冲突
// 核心原理：点击登录时直接从 DOM 获取输入框的值，不依赖 React useState
export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  // 非受控组件：使用 ref 直接访问 DOM
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // UI 状态
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // 防止重复提交
  const submittedRef = useRef(false);

  // UI 层超时兜底
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      if (submittedRef.current) {
        submittedRef.current = false;
        setLoading(false);
        setError('登录超时，请重试');
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, [loading]);

  // 登录点击 - 直接从 DOM 获取值
  const handleLoginClick = async () => {
    // 直接从 DOM 获取当前值（非受控模式）
    const usernameValue = usernameInputRef.current?.value?.trim() || '';
    const passwordValue = passwordInputRef.current?.value || '';

    // 基本校验
    if (!usernameValue) {
      setError('请输入用户名');
      return;
    }
    if (!passwordValue) {
      setError('请输入密码');
      return;
    }

    // 防止重复提交
    if (loading || submittedRef.current) return;
    submittedRef.current = true;
    setError('');
    setLoading(true);

    try {
      const success = await login(usernameValue, passwordValue);
      if (success) {
        setSuccessMessage('登录成功，正在进入首页...');
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 300);
      } else {
        setError('登录失败，请检查用户名和密码后重试');
        submittedRef.current = false;
        setLoading(false);
      }
    } catch (err: any) {
      setError('无法连接到服务器，请检查网络后重试');
      submittedRef.current = false;
      setLoading(false);
    }
  };

  // 清除错误
  const handleInputFocus = () => {
    if (error) setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* LOGO 与标题 */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4 text-white text-3xl font-bold">
            起
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">起飞塔</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">请登录以继续使用</p>
        </div>

        {/* 登录框 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8">
          {/* 错误提示 */}
          {error && (
            <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* 成功提示 */}
          {successMessage && (
            <div className="mb-5 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-600 dark:text-green-400">
              {successMessage}
            </div>
          )}

          {/* 用户名 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              用户名
            </label>
            <input
              ref={usernameInputRef}
              type="text"
              onFocus={handleInputFocus}
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              placeholder="请输入用户名"
            />
          </div>

          {/* 密码 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              密码
            </label>
            <input
              ref={passwordInputRef}
              type="password"
              onFocus={handleInputFocus}
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              placeholder="请输入密码"
            />
          </div>

          {/* 登录按钮 */}
          <button
            onClick={handleLoginClick}
            type="button"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                登录中...
              </>
            ) : (
              '登录'
            )}
          </button>

          {/* 忘记密码/注册 */}
          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>忘记密码？请联系管理员重置</p>
            <p className="mt-2">
              还没有账号？
              <button
                type="button"
                onClick={() => setError('请联系管理员注册新账户')}
                className="text-blue-600 dark:text-blue-400 font-medium ml-1 hover:underline"
              >
                联系管理员注册
              </button>
            </p>
          </div>
        </div>

        {/* 底部版权 */}
        <div className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          起飞塔视频分享平台 v1.0.0
        </div>
      </div>
    </div>
  );
}
