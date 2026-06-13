# 起飞塔 · 更新发布工具 (PC 端)

一个 **Windows 桌面 EXE 程序**，用于把新版 APK/IPA 拖进窗口，一键上传到 Cloudflare R2 并发布到服务器。
手机端 APP 启动后会自动检测到新版本并提示更新。

---

## 🚀 快速开始（首次使用）

### 1. 安装 Python 依赖（开发 / 调试）

```bash
cd update_publisher
pip install -r requirements.txt
```

### 2. 授权你的 PC 设备

每个发布工具 PC 需要先在后端 D1 数据库中授权：

1. 运行 `python main.py`
2. 在顶部可以看到你的 **设备ID**（形如 `pc-xxxxxxxxxxxx`）
3. 打开 [Cloudflare D1 控制台](https://dash.cloudflare.com/)，进入你的数据库
4. 执行以下 SQL（程序启动时也会弹出提示框自动复制）：

```sql
INSERT INTO app_update_devices (id, deviceId, deviceName, grantedBy, grantedAt, isActive)
VALUES ('pc-时间戳', '你的设备ID', 'PC-更新发布工具', 'manual', datetime('now'), 1);
```

### 3. 发布新版 APK

1. 运行程序后，把新版 APK 文件 **拖进窗口**，或点击「浏览」按钮选择
2. 填写版本号（程序会自动尝试从 APK 中读取）
3. 填写更新日志（可选）
4. 勾选是否「强制更新」
5. 填入管理密码（默认 `updateAdmin888`）
6. 点击 **🚀 一键发布新版本**
7. 等待上传完成 —— 手机端打开 APP 即会弹出更新提示！

---

## 📦 打包成 EXE

在 Windows 上直接双击运行 **`build.bat`**：

```bash
build.bat
```

产物位置：`dist\起飞塔更新发布工具.exe`

生成的 **单个 EXE 文件** 可以直接拷贝到任意 Windows 电脑运行（无须安装 Python）。

> 提示：首次运行 EXE 时仍需执行设备授权 SQL（会弹出授权对话框自动复制 SQL）。

---

## 📁 项目文件

| 文件 | 说明 |
|-----|------|
| `main.py` | 主程序（PyQt5 UI + HTTP 上传 + 版本发布） |
| `requirements.txt` | Python 依赖 |
| `build.bat` | 一键打包为 EXE |
| `README.md` | 本说明文档 |

---

## 🔧 运行机制

1. **拖放文件** → 读取文件大小，尝试解析 APK 的 `versionName` / `versionCode`（使用 `androguard`）
2. **分片上传** → 5 MB / 分片，逐片 POST 到 `/api/upload/chunk`
3. **合并分片** → POST `/api/upload/complete`，得到最终下载链接
4. **发布版本** → POST `/api/app-updates/publish`，提交版本号 / 文件大小 / 更新日志 / 是否强制 / 平台
5. **手机端检测** → APP 启动时 POST `/api/app-updates/check`，对比本地版本号，发现更新后弹出下载提示

---

## 🔐 权限控制

- **管理密码**：后端校验 `UPDATE_ADMIN_PASSWORD`（默认 `updateAdmin888`）
- **设备白名单**：后端检查 `app_update_devices` 表中的 `deviceId`，未授权则拒绝发布
- 两个条件必须同时满足，才能发布新版本

---

## 🌐 API 地址

当前使用：`https://nzx-5o4.pages.dev/api`

如需修改，在 `main.py` 顶部修改 `API_BASE` 常量后重新打包即可。

---

## ❓ 常见问题

**Q: 提示 "设备未授权"？**
A: 首次运行会弹出授权对话框，点击「复制 SQL」后到 Cloudflare D1 控制台执行即可。

**Q: APK 版本号没有自动识别？**
A: 请确认已安装 `androguard`（`pip install androguard`），或手动填写版本号即可。

**Q: 上传失败 / 网络错误？**
A: 检查本机能否访问 `https://nzx-5o4.pages.dev`。分片上传有 3 次自动重试。

**Q: 如何删除已发布的旧版本？**
A: 目前需要通过 [PC 端 Web 管理后台](https://nzx-5o4.pages.dev/update-admin-web) 或 Cloudflare D1 控制台操作。
