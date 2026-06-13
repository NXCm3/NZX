// 主题管理工具
// 主题模式：
//   - 'auto'  跟随系统：根据时间自动切换（7:00-18:00 浅色，其他时间深色）
//   - 'light' 浅色：白色背景 + 深色文字
//   - 'dark'  深色：黑色背景 + 白色文字

export type ThemeMode = 'light' | 'dark' | 'auto';

// 根据当前时间计算应该用什么模式
// 7:00  - 18:00  → 浅色
// 18:00 - 次日 7:00 → 深色
export function getEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';

  // auto 模式：根据当前时间
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 7 && hour < 18) {
    return 'light';
  }
  return 'dark';
}

// 将主题应用到 DOM
// 使用 Tailwind 的 dark: 类 + data-theme 属性
export function applyThemeToDocument(mode: ThemeMode): void {
  const effective = getEffectiveTheme(mode);

  // 设置 root 的 dark 类（Tailwind 需要）
  const root = document.documentElement;

  if (effective === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
}

// 从 localStorage 读取当前主题模式
export function loadThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('pref_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return 'auto';
}

// 保存主题模式到 localStorage
export function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem('pref_theme', mode);
  } catch (e) {
    // ignore
  }
}
