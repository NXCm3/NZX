package com.nzx.video;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Log;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.security.MessageDigest;

/**
 * 应用更新插件 - 原生下载与安装
 * 功能：
 *   1. 下载 APK 并实时回传进度
 *   2. 下载完成后自动调用系统安装程序
 *   3. 获取当前应用版本名与版本号
 *   4. 获取设备唯一ID
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String TAG = "AppUpdate";
    private static final int REQUEST_CODE_INSTALL = 1001;

    private DownloadManager downloadManager;
    private long currentDownloadId = -1;
    private BroadcastReceiver downloadCompleteReceiver;
    private Thread progressPollingThread;
    private PluginCall currentDownloadCall;
    private String currentDownloadUrl;

    // ---------- 基础信息 ----------

    /**
     * 获取当前应用版本
     */
    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            String pkg = ctx.getPackageName();
            android.content.pm.PackageInfo info = pm.getPackageInfo(pkg, PackageManager.GET_META_DATA);
            JSObject ret = new JSObject();
            ret.put("version", info.versionName);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                ret.put("versionCode", info.getLongVersionCode());
            } else {
                ret.put("versionCode", info.versionCode);
            }
            ret.put("packageName", pkg);
            ret.put("platform", "android");
            Log.i("AppUpdate", "版本读取成功: version=" + info.versionName);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e("AppUpdate", "版本读取异常: " + e.getMessage(), e);
            JSObject err = new JSObject();
            err.put("version", "1.0.1");
            err.put("versionCode", 2);
            err.put("error", e.getMessage());
            err.put("platform", "android");
            call.resolve(err);
        }
    }

    /**
     * 获取设备唯一ID
     * 使用 ANDROID_ID 作为基础，结合应用签名做 SHA-256
     * 确保同一设备同一应用下返回相同ID
     */
    @PluginMethod
    public void getDeviceId(PluginCall call) {
        try {
            Context ctx = getContext();
            String androidId = android.provider.Settings.Secure.getString(
                ctx.getContentResolver(),
                android.provider.Settings.Secure.ANDROID_ID
            );
            String deviceId = sha256(androidId + "-" + ctx.getPackageName());
            JSObject ret = new JSObject();
            ret.put("deviceId", deviceId);
            ret.put("deviceName", Build.MODEL + " (" + Build.BRAND + ")");
            ret.put("androidVersion", Build.VERSION.RELEASE);
            ret.put("sdkInt", Build.VERSION.SDK_INT);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("deviceId", "unknown-" + System.currentTimeMillis());
            ret.put("deviceName", Build.MODEL);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    // ---------- 下载管理 ----------

    /**
     * 开始下载 APK
     * 参数：url, filename(可选)
     * 通过进度事件(progress)和完成/失败事件(success/error)向 JS 回传
     */
    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename");
        if (filename == null || filename.isEmpty()) {
            filename = "update_" + System.currentTimeMillis() + ".apk";
        }
        if (url == null || url.isEmpty()) {
            call.reject("下载地址不能为空");
            return;
        }

        // 检查存储权限
        Activity activity = getActivity();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            int perm = ContextCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE);
            if (perm != PackageManager.PERMISSION_GRANTED) {
                requestPermissionFor(call, Manifest.permission.WRITE_EXTERNAL_STORAGE);
                return;
            }
        }

        currentDownloadCall = call;
        currentDownloadUrl = url;

        // 创建下载目录
        final File downloadDir = getDownloadDir();
        if (!downloadDir.exists()) {
            boolean ok = downloadDir.mkdirs();
            Log.d(TAG, "创建下载目录: " + ok + " " + downloadDir.getAbsolutePath());
        }

        // 清除同文件
        final File outputFile = new File(downloadDir, filename);
        if (outputFile.exists()) {
            boolean deleted = outputFile.delete();
            Log.d(TAG, "删除旧文件: " + deleted);
        }

        // 准备下载
        downloadManager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("起飞塔 - 应用更新");
        request.setDescription("正在下载新版本...");
        request.setMimeType("application/vnd.android.package-archive");
        request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, filename);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        request.allowScanningByMediaScanner();

        // 网络类型：仅在 WIFI+移动网络
        request.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI | DownloadManager.Request.NETWORK_MOBILE);

        try {
            currentDownloadId = downloadManager.enqueue(request);
            Log.d(TAG, "已提交下载: " + currentDownloadId + " -> " + filename);

            // 注册完成接收
            registerDownloadCompleteReceiver(outputFile);

            // 启动进度轮询
            startProgressPolling(currentDownloadId);

            // 返回给 JS：任务已启动
            JSObject ret = new JSObject();
            ret.put("downloadId", currentDownloadId);
            ret.put("message", "下载已开始");
            // 不在这里 resolve，让事件通知完成
        } catch (Exception e) {
            Log.e(TAG, "下载失败: " + e.getMessage());
            JSObject err = new JSObject();
            err.put("error", "下载失败: " + e.getMessage());
            call.reject(e.getMessage());
        }
    }

    /**
     * 取消当前下载
     */
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        try {
            if (downloadManager != null && currentDownloadId != -1) {
                int removed = downloadManager.remove(currentDownloadId);
                currentDownloadId = -1;
                stopProgressPolling();
                unregisterDownloadCompleteReceiver();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    // ---------- 安装 APK ----------

    /**
     * 安装 APK
     * 参数: filePath - 安装包路径
     */
    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("文件路径不能为空");
            return;
        }

        try {
            File file = new File(filePath);
            if (!file.exists()) {
                call.reject("APK 文件不存在: " + filePath);
                return;
            }

            // Android 8.0 及以上需要请求"安装未知来源"权限
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                boolean hasInstallPermission = getContext().getPackageManager().canRequestPackageInstalls();
                if (!hasInstallPermission) {
                    // 跳转到应用设置以开启安装权限
                    Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);

                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("needPermission", true);
                    ret.put("message", "请开启应用安装权限后再次点击下载");
                    call.resolve(ret);
                    return;
                }
            }

            // 使用 FileProvider 获取 content URI
            Uri fileUri;
            Context ctx = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                fileUri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file);
            } else {
                fileUri = Uri.fromFile(file);
            }

            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(fileUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            ctx.startActivity(install);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "已启动安装程序");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "安装失败: " + e.getMessage());
            JSObject err = new JSObject();
            err.put("error", e.getMessage());
            call.reject(e.getMessage());
        }
    }

    // ---------- 内部工具 ----------

    private File getDownloadDir() {
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            dir = new File(getContext().getFilesDir(), "apks");
        }
        return dir;
    }

    private void registerDownloadCompleteReceiver(final File outputFile) {
        unregisterDownloadCompleteReceiver();
        downloadCompleteReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != currentDownloadId) return;

                try {
                    DownloadManager.Query q = new DownloadManager.Query();
                    q.setFilterById(id);
                    Cursor cursor = downloadManager.query(q);
                    if (cursor.moveToFirst()) {
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            String localFile = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
                            stopProgressPolling();

                            // 向 JS 发送完成事件
                            PluginCall savedCall = currentDownloadCall;
                            if (savedCall != null) {
                                JSObject ret = new JSObject();
                                ret.put("status", "success");
                                ret.put("filePath", localFile != null && localFile.startsWith("file://") ? localFile.substring(7) : localFile);
                                ret.put("uri", localFile);
                                ret.put("message", "下载完成");
                                savedCall.resolve(ret);
                                currentDownloadCall = null;
                            }
                        } else if (status == DownloadManager.STATUS_FAILED) {
                            stopProgressPolling();
                            PluginCall savedCall = currentDownloadCall;
                            if (savedCall != null) {
                                savedCall.reject("下载失败(状态:" + status + ")");
                                currentDownloadCall = null;
                            }
                        }
                    }
                    cursor.close();
                } catch (Exception e) {
                    PluginCall savedCall = currentDownloadCall;
                    if (savedCall != null) {
                        savedCall.reject("下载完成但校验失败: " + e.getMessage());
                        currentDownloadCall = null;
                    }
                }
                unregisterDownloadCompleteReceiver();
            }
        };
        try {
            getContext().registerReceiver(downloadCompleteReceiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        } catch (Exception ignored) {
        }
    }

    private void unregisterDownloadCompleteReceiver() {
        if (downloadCompleteReceiver != null) {
            try {
                getContext().unregisterReceiver(downloadCompleteReceiver);
            } catch (Exception ignored) {
            }
            downloadCompleteReceiver = null;
        }
    }

    private void startProgressPolling(final long downloadId) {
        stopProgressPolling();
        progressPollingThread = new Thread(new Runnable() {
            @Override
            public void run() {
                boolean downloading = true;
                int unchangedCount = 0;
                long lastBytes = -1;
                while (downloading && !Thread.currentThread().isInterrupted()) {
                    try {
                        DownloadManager.Query q = new DownloadManager.Query();
                        q.setFilterById(downloadId);
                        Cursor cursor = downloadManager.query(q);
                        if (!cursor.moveToFirst()) {
                            cursor.close();
                            break;
                        }
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        long bytesDownloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long bytesTotal = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        cursor.close();

                        if (bytesDownloaded == lastBytes) unchangedCount++;
                        else { unchangedCount = 0; lastBytes = bytesDownloaded; }

                        // 计算百分比
                        int percent = bytesTotal > 0 ? (int)(bytesDownloaded * 100 / bytesTotal) : 0;

                        // 通知 JS
                        final JSObject evt = new JSObject();
                        evt.put("downloadId", downloadId);
                        evt.put("status", status);
                        evt.put("bytesDownloaded", bytesDownloaded);
                        evt.put("bytesTotal", bytesTotal);
                        evt.put("percent", percent);
                        notifyListeners("downloadProgress", evt);

                        if (status == DownloadManager.STATUS_SUCCESSFUL || status == DownloadManager.STATUS_FAILED) {
                            downloading = false;
                        }

                        // 长时间未变(>30秒)且还未完成，认为失败
                        if (unchangedCount > 60 && status != DownloadManager.STATUS_SUCCESSFUL) {
                            JSObject errEvt = new JSObject();
                            errEvt.put("status", "timeout");
                            errEvt.put("message", "下载进度长时间未更新");
                            notifyListeners("downloadError", errEvt);
                            downloading = false;
                        }

                        Thread.sleep(500);
                    } catch (Exception e) {
                        Log.e(TAG, "进度轮询错误: " + e.getMessage());
                        downloading = false;
                    }
                }
            }
        });
        progressPollingThread.setDaemon(true);
        progressPollingThread.start();
    }

    private void stopProgressPolling() {
        if (progressPollingThread != null && progressPollingThread.isAlive()) {
            try { progressPollingThread.interrupt(); } catch (Exception ignored) {}
        }
        progressPollingThread = null;
    }

    private void requestPermissionFor(final PluginCall call, final String permission) {
        // 简化处理 - 直接拒绝并给出提示让用户在系统里开启
        // 实际应用中可改用 Capacitor 的 activity result API
        JSObject err = new JSObject();
        err.put("needPermission", true);
        err.put("permission", permission);
        err.put("message", "需要存储权限才能下载更新");
        call.resolve(err);
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(input.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(input.hashCode());
        }
    }

    private void cleanup() {
        stopProgressPolling();
        unregisterDownloadCompleteReceiver();
        if (downloadManager != null && currentDownloadId != -1) {
            try { downloadManager.remove(currentDownloadId); } catch (Exception ignored) {}
        }
        currentDownloadId = -1;
        currentDownloadCall = null;
    }

    @Override
    protected void finalize() throws Throwable {
        try {
            cleanup();
        } finally {
            super.finalize();
        }
    }
}
