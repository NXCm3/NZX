package com.nzx.video;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * ============================================================
 * 应用主入口 — 返回键同步拦截（v3 最终版）
 * ============================================================
 *
 * 🔴 核心修复：
 *   - 旧方案：onBackPressed() + evaluateJavascript 异步 → 竞态条件导致直接退出
 *   - 新方案：覆盖 onKeyDown() 同步拦截返回键，使用 CountDownLatch 等待 JS 结果
 *
 * 事件流：
 *   ① onKeyDown(KEYCODE_BACK) → 同步阻塞直到 JS 返回
 *   ② evaluateJavascript → 调用 window.__HANDLE_BACK__()
 *   ③ 等待 JS 返回（最多 600ms）
 *   ④ 根据返回值决定：
 *       BACK_HANDLED → return true（消费事件，不退出）
 *       NEED_EXIT    → showToast + return true（消费事件，Toast）
 *       EXIT_NOW     → return false + finish()（退出）
 *       NO_HANDLER   → return false（让系统处理）
 *       超时         → return false（让系统处理）
 *
 * 日志查看：
 *   adb logcat -s MainActivity:V | findstr "返回键|按下|onKeyDown|ACTION_DOWN"
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    // 首页"再按一次退出"：记录上次按键时间
    private long lastBackPressTime = 0;
    private static final long BACK_PRESS_EXIT_INTERVAL = 2000; // 2秒

    // JS 响应容器（用于同步等待）
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 注册 AppUpdate 插件
        this.registerPlugin(AppUpdatePlugin.class);

        // 注入版本信息到 JS 全局变量
        injectAppInfo();

        android.util.Log.i(TAG, "===============================================");
        android.util.Log.i(TAG, "✅ onCreate — 应用已启动");
        android.util.Log.i(TAG, "===============================================");
    }

    /**
     * 🔴 核心修复：覆盖 onKeyDown 同步拦截返回键
     *
     * KEY_DOWN 事件会先于 onBackPressed() 被调用。
     * 我们在这里同步等待 JS 层的结果，然后决定是否消费事件。
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // 🔴 只拦截返回键
        if (keyCode != KeyEvent.KEYCODE_BACK) {
            return super.onKeyDown(keyCode, event);
        }

        // 确保是 ACTION_DOWN（避免重复触发）
        if (event.getAction() != KeyEvent.ACTION_DOWN) {
            return true;
        }

        android.util.Log.i(TAG, "===============================================");
        android.util.Log.i(TAG, "🔴 ===== 按下物理返回键 [onKeyDown 同步拦截] =====");
        android.util.Log.i(TAG, "===============================================");
        android.util.Log.i(TAG, "  event: KEYCODE_BACK, ACTION_DOWN");
        android.util.Log.i(TAG, "  event.getFlags(): " + event.getFlags());

        // 🔴 同步等待 JS 层结果（最多等待 600ms）
        final AtomicReference<String> jsResult = new AtomicReference<>(null);
        final CountDownLatch latch = new CountDownLatch(1);

        final WebView webView = getBridgeWebView();
        if (webView == null) {
            android.util.Log.e(TAG, "  ❌ WebView 为 null，走系统默认处理");
            return super.onKeyDown(keyCode, event);
        }

        android.util.Log.i(TAG, "  → 调用 JS 层 window.__HANDLE_BACK__() (同步等待中...)");

        // 在主线程执行 JS 调用
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    webView.evaluateJavascript(
                        "(function(){" +
                            "try {" +
                                "if (typeof window.__HANDLE_BACK__ === 'function') {" +
                                    "var r = window.__HANDLE_BACK__();" +
                                    "return (r && r.action ? JSON.stringify(r) : '{\"action\":\"NO_RETURN\"}');" +
                                "} else {" +
                                    "return '{\"action\":\"NO_HANDLER\"}';" +
                                "}" +
                            "} catch(e) {" +
                                "return '{\"action\":\"JS_ERROR\",\"msg\":\"' + String(e) + '\"}';" +
                            "}" +
                        "})();",
                        new ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                jsResult.set(value);
                                android.util.Log.i(TAG, "  [JS 返回] " + value);
                                latch.countDown();
                            }
                        }
                    );
                } catch (Throwable t) {
                    android.util.Log.e(TAG, "  ❌ evaluateJavascript 异常", t);
                    jsResult.set("{\"action\":\"JS_EXCEPTION\"}");
                    latch.countDown();
                }
            }
        });

        // 🔴 同步等待 JS 结果（最多 600ms）
        try {
            boolean gotResult = latch.await(600, TimeUnit.MILLISECONDS);
            if (!gotResult) {
                android.util.Log.w(TAG, "  ⚠️ JS 层 600ms 内无响应 → 让系统处理");
                return super.onKeyDown(keyCode, event);
            }
        } catch (InterruptedException e) {
            android.util.Log.e(TAG, "  ❌ 等待被中断", e);
            return super.onKeyDown(keyCode, event);
        }

        // 🔴 根据 JS 返回值决定行为
        String result = jsResult.get();
        if (result == null) {
            android.util.Log.w(TAG, "  ⚠️ result 为 null → 让系统处理");
            return super.onKeyDown(keyCode, event);
        }

        result = result.trim();
        android.util.Log.i(TAG, "  [JS 返回] 解析: " + result);

        // 提取 action 值（JS 返回的是 JSON 字符串）
        String action = extractAction(result);

        android.util.Log.i(TAG, "  [JS action] = " + action);

        if ("BACK_HANDLED".equals(action)) {
            // ✅ JS 已处理返回 → 消费事件，不退出
            android.util.Log.i(TAG, "  ✅ JS 已处理返回 → return true (消费事件)");
            android.util.Log.i(TAG, "===============================================");
            return true;

        } else if ("NEED_EXIT".equals(action)) {
            // ⏸️ 首次按返回键 → 显示 Toast，消费事件
            android.util.Log.i(TAG, "  ⏸️ 首次按 → 显示 Toast \"再按一次退出\"");
            showExitToast();
            android.util.Log.i(TAG, "  ✅ 显示退出提示 → return true (消费事件)");
            android.util.Log.i(TAG, "===============================================");
            return true;

        } else if ("EXIT_NOW".equals(action)) {
            // ❌ 2秒内连续按 → 立即退出
            android.util.Log.i(TAG, "  ❌ 连续按返回退出 → 调用 finish()");
            android.util.Log.i(TAG, "===============================================");
            android.util.Log.i(TAG, "  ❌❌❌ 应用退出 ❌❌❌");
            android.util.Log.i(TAG, "===============================================");
            finish();
            return true;

        } else {
            // ⚠️ JS 没有处理函数或出错 → 让系统处理（返回上一页或显示 Toast）
            android.util.Log.w(TAG, "  ⚠️ JS 无处理/出错 → 让系统默认处理");
            android.util.Log.i(TAG, "===============================================");
            return super.onKeyDown(keyCode, event);
        }
    }

    /**
     * 🔴 从 JS 返回的 JSON 字符串中提取 action 字段
     */
    private String extractAction(String json) {
        if (json == null) return "NULL";
        // 简单解析 {"action":"BACK_HANDLED"} 或 {"action":"BACK_HANDLED","xxx":...}
        int idx = json.indexOf("\"action\"");
        if (idx < 0) return "PARSE_ERROR";
        int colon = json.indexOf(":", idx);
        if (colon < 0) return "PARSE_ERROR";
        int startQuote = json.indexOf("\"", colon + 1);
        if (startQuote < 0) return "PARSE_ERROR";
        int endQuote = json.indexOf("\"", startQuote + 1);
        if (endQuote < 0) return "PARSE_ERROR";
        return json.substring(startQuote + 1, endQuote);
    }

    /**
     * 显示"再按一次退出" Toast（主线程）
     */
    private void showExitToast() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    android.widget.Toast.makeText(
                        MainActivity.this,
                        "再按一次退出应用",
                        android.widget.Toast.LENGTH_SHORT
                    ).show();
                } catch (Throwable ignored) {}
            }
        });
    }

    /**
     * 注入版本信息到 JS 全局变量 window.__APP_INFO__
     */
    private void injectAppInfo() {
        try {
            Context ctx = getApplicationContext();
            PackageManager pm = ctx.getPackageManager();
            String pkg = ctx.getPackageName();
            android.content.pm.PackageInfo pinfo = pm.getPackageInfo(pkg, 0);
            long vcode = (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P)
                    ? pinfo.getLongVersionCode() : pinfo.versionCode;
            String vname = pinfo.versionName;

            final String js = "(function(){" +
                    "window.__APP_INFO__={version:'" + vname + "',versionCode:" + vcode +
                    ",packageName:'" + pkg + "',platform:'android'};" +
                    "console.log('[Native] __APP_INFO__ injected:',JSON.stringify(window.__APP_INFO__));" +
                    "})();";

            final WebView wv = getBridgeWebView();
            if (wv != null) {
                wv.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            wv.evaluateJavascript(js, null);
                            android.util.Log.i(TAG, "✅ 版本信息注入成功: " + vname + "/" + vcode);
                        } catch (Throwable t) {
                            android.util.Log.e(TAG, "❌ 版本信息注入失败", t);
                        }
                    }
                });
            }
        } catch (Exception e) {
            android.util.Log.e(TAG, "❌ 获取版本信息异常", e);
        }
    }

    /**
     * 获取 Bridge 中的 WebView 实例
     */
    private WebView getBridgeWebView() {
        try {
            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                return this.getBridge().getWebView();
            }
        } catch (Throwable ignored) {}
        return null;
    }
}
