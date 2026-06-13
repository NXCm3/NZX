import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nzx.video',
  appName: 'NZX私有视频',
  webDir: 'dist',
  server: {
    // 允许所有外部 URL
    allowNavigation: ["*"],
    allowExternalNavigation: ["*"],
  },
  android: {
    // 覆盖 WebView 配置
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // 背景颜色（防止启动白屏）
    backgroundColor: '#ffffff',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
