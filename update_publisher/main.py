# -*- coding: utf-8 -*-
"""
起飞塔 · 应用更新发布工具 (PC端 EXE)
------------------------------------
功能：
  1. 拖放 APK 文件到窗口
  2. 自动读取 APK 版本号 / 包名 (可选)
  3. 通过分片上传将 APK 上传到 Cloudflare R2
  4. 发布到 /api/app-updates/publish
  5. 手机端打开 APP 即检测到新版本并弹窗更新

使用前：
  - 在 config.ini 中填写 管理密码 和 设备ID
  - 首次使用需要授权设备：运行后会自动生成 PC 设备ID，
    将 SQL 语句复制到 Cloudflare D1 控制台执行即可

打包：
  - pip install -r requirements.txt
  - python build.py
  - 产物在 dist/起飞塔更新发布工具.exe
"""

import os
import sys
import json
import time
import hashlib
import base64
import threading
import traceback
import zipfile
import re
from pathlib import Path
from typing import Optional

import requests
from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QUrl, QFile, QTextStream
from PyQt5.QtGui import QDragEnterEvent, QDropEvent, QPainter, QColor, QFont, QPixmap, QIcon
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QLineEdit, QTextEdit, QProgressBar, QFileDialog, QCheckBox,
    QMessageBox, QGroupBox, QFormLayout, QComboBox, QFrame, QSizePolicy,
    QStyle, QSplashScreen, QDialog
)

# ========================================================================
# 配置与工具函数
# ========================================================================

API_BASE = "https://nzx-5o4.pages.dev/api"
UPDATE_ADMIN_PASSWORD_DEFAULT = "updateAdmin888"
CHUNK_SIZE = 5 * 1024 * 1024  # 5MB / 分片
APP_NAME = "起飞塔更新发布工具"

def get_base_path() -> str:
    """返回资源根目录：源码调试取 script 目录，打包后取 _MEIPASS 临时目录"""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(sys.argv[0]))

def get_config_path() -> str:
    """config.ini 放在 exe 同级目录，方便用户修改"""
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(sys.executable), "config.ini")
    return os.path.join(get_base_path(), "config.ini")

def get_appdata_path() -> str:
    """AppData 目录 - 用于保存设备ID等可写数据"""
    path = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "QifeitaUpdater")
    Path(path).mkdir(parents=True, exist_ok=True)
    return path

def gen_pc_device_id() -> str:
    """基于 PC 硬件 / 环境信息生成稳定的设备 ID"""
    try:
        import uuid
        try:
            mac = uuid.getnode()
        except Exception:
            mac = 0
        hostname = os.environ.get("COMPUTERNAME", "") or os.environ.get("HOSTNAME", "pc")
        raw = f"pc-{mac}-{hostname}-{sys.platform}-{os.environ.get('USERNAME','')}"
    except Exception:
        raw = f"pc-{time.time()}-{os.getpid()}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
    return f"pc-{digest}"

def load_device_id() -> str:
    p = os.path.join(get_appdata_path(), "device_id.txt")
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            pass
    did = gen_pc_device_id()
    try:
        with open(p, "w", encoding="utf-8") as f:
            f.write(did)
    except Exception:
        pass
    return did

def human_size(n: int) -> str:
    if n is None or n <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB"]
    i = 0
    v = float(n)
    while v >= 1024 and i < len(units) - 1:
        v /= 1024
        i += 1
    return f"{v:.1f} {units[i]}"

def extract_apk_info(apk_path: str) -> dict:
    """从 APK 中读取 AndroidManifest.xml 里的 versionName / versionCode / package
    (使用 androguard 解析 aapt-style 的二进制 XML；若未安装则返回空)
    """
    info = {"version": "", "version_code": 0, "package": "", "ok": False}
    try:
        import androguard.core.bytecodes.apk as _apk
        a = _apk.APK(apk_path, raw=False)
        info["version"] = a.get_androidversion_name() or ""
        try:
            info["version_code"] = int(a.get_androidversion_code() or 0)
        except Exception:
            info["version_code"] = 0
        info["package"] = a.get_package() or ""
        info["ok"] = True
        return info
    except Exception:
        pass
    # 降级方案：尝试调用 aapt / aapt2
    try:
        from shutil import which
        cmd = None
        for tool in ("aapt2", "aapt"):
            if which(tool):
                cmd = tool
                break
        if cmd:
            import subprocess
            out = subprocess.run(
                [cmd, "dump", "badging", apk_path],
                capture_output=True, text=True, timeout=30
            ).stdout or ""
            m = re.search(r"package:\s+name='([^']+)'.*?versionCode='(\d+)'.*?versionName='([^']+)'", out)
            if m:
                info["package"] = m.group(1)
                info["version_code"] = int(m.group(2))
                info["version"] = m.group(3)
                info["ok"] = True
    except Exception:
        pass
    return info


# ========================================================================
# 后台工作线程：上传 + 发布
# ========================================================================

class PublishWorker(QThread):
    log = pyqtSignal(str, str)   # level, message
    progress = pyqtSignal(int, int)  # bytes_done, bytes_total
    finished_ok = pyqtSignal(bool, str, str, str)  # success, version, url, message

    def __init__(self, apk_path: str, password: str, device_id: str,
                 version: str, release_notes: str, is_force: bool,
                 platform: str, parent=None):
        super().__init__(parent)
        self.apk_path = apk_path
        self.password = password
        self.device_id = device_id
        self.version = version
        self.release_notes = release_notes
        self.is_force = is_force
        self.platform = platform
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def _l(self, level: str, msg: str):
        self.log.emit(level, msg)

    # ---------------- HTTP ----------------
    _DEFAULT_HEADERS = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }

    def _post_json(self, path: str, data: dict) -> dict:
        try:
            r = requests.post(API_BASE + path, json=data, timeout=60,
                              headers=self._DEFAULT_HEADERS)
            try:
                return r.json()
            except Exception:
                return {"error": f"HTTP {r.status_code}: {r.text[:200]}"}
        except Exception as e:
            return {"error": f"网络请求失败: {str(e)[:200]}"}

    def _post_files(self, path: str, files: dict, data: dict) -> dict:
        try:
            r = requests.post(API_BASE + path, files=files, data=data, timeout=300,
                              headers={"User-Agent": self._DEFAULT_HEADERS["User-Agent"]})
            try:
                return r.json()
            except Exception:
                return {"error": f"HTTP {r.status_code}: {r.text[:200]}"}
        except Exception as e:
            return {"error": f"网络请求失败: {str(e)[:200]}"}

    # ---------------- 分片上传 ----------------
    def _upload_chunks(self) -> str:
        """返回最终文件 URL"""
        file_size = os.path.getsize(self.apk_path)
        file_name = os.path.basename(self.apk_path)
        total_chunks = max(1, (file_size + CHUNK_SIZE - 1) // CHUNK_SIZE)

        # 1. 创建上传会话
        self._l("info", f"[1/3] 创建上传会话 ... 文件大小 {human_size(file_size)}，共 {total_chunks} 分片")
        init_data = self._post_json("/upload/init", {
            "filename": file_name,
            "totalChunks": total_chunks,
        })
        upload_id = init_data.get("uploadId")
        if not upload_id:
            raise Exception(f"创建上传会话失败: {init_data.get('error','未知错误')}")
        self._l("info", f"会话ID: {upload_id}")

        # 2. 逐分片上传
        uploaded_bytes = 0
        self.progress.emit(0, file_size)

        with open(self.apk_path, "rb") as f:
            for idx in range(total_chunks):
                if self._cancelled:
                    raise Exception("已取消")
                chunk_data = f.read(CHUNK_SIZE)
                if not chunk_data:
                    break

                files = {"file": (f"chunk_{idx}", chunk_data, "application/octet-stream")}
                payload = {"uploadId": upload_id, "chunkIndex": idx, "totalChunks": total_chunks}

                for attempt in range(3):
                    try:
                        rj = self._post_files("/upload/chunk", files, payload)
                        if rj.get("success") or rj.get("chunkIndex") is not None:
                            uploaded_bytes += len(chunk_data)
                            self.progress.emit(uploaded_bytes, file_size)
                            self._l("info", f"  → 分片 {idx + 1}/{total_chunks} 完成 ({human_size(uploaded_bytes)}/{human_size(file_size)})")
                            break
                        else:
                            raise Exception(rj.get("error", "未知错误"))
                    except Exception as ex:
                        if attempt < 2:
                            self._l("warn", f"  分片 {idx + 1} 上传失败，{attempt + 1} 秒后重试: {ex}")
                            time.sleep(attempt + 1)
                            # 回到文件位置重新读取
                            f.seek(uploaded_bytes)
                        else:
                            raise
                else:
                    raise Exception("分片上传多次重试失败")

        # 3. 合并分片
        self._l("info", "[3/3] 合并分片 ...")
        merge_data = self._post_json("/upload/complete", {
            "uploadId": upload_id, "filename": file_name, "totalChunks": total_chunks
        })
        file_url = merge_data.get("url") or merge_data.get("fileUrl")
        if not file_url:
            raise Exception(f"合并失败: {merge_data.get('error', '未知错误')}")

        return file_url

    # ---------------- 发布版本 ----------------
    def run(self):
        try:
            if not self.apk_path or not os.path.exists(self.apk_path):
                raise Exception("请先选择 APK 文件")
            if not self.password:
                raise Exception("请填写管理密码")
            if not self.device_id:
                raise Exception("设备ID 未生成")
            if not self.version:
                raise Exception("请填写版本号")

            file_size = os.path.getsize(self.apk_path)
            self._l("info", f"开始发布: {self.apk_path}")
            self._l("info", f"版本: {self.version} | 平台: {self.platform} | 强制更新: {'是' if self.is_force else '否'}")

            file_url = self._upload_chunks()
            self._l("success", f"文件已上传: {file_url}")

            # 读取 APK 计算 checksum
            try:
                h = hashlib.md5()
                with open(self.apk_path, "rb") as f:
                    for block in iter(lambda: f.read(1024 * 1024), b""):
                        h.update(block)
                checksum = h.hexdigest()
            except Exception:
                checksum = ""

            # 计算 version_code (把版本号 x.y.z → x*10000 + y*100 + z)
            try:
                parts = re.split(r"[.\-]", self.version)
                nums = [int(x) for x in parts if x.isdigit()][:3]
                while len(nums) < 3:
                    nums.append(0)
                version_code = nums[0] * 10000 + nums[1] * 100 + nums[2]
            except Exception:
                version_code = int(time.time())

            # 发布
            self._l("info", "正在注册新版本到服务器 ...")
            data = self._post_json("/app-updates/publish", {
                "password": self.password,
                "deviceId": self.device_id,
                "version": self.version,
                "versionCode": version_code,
                "downloadUrl": file_url,
                "fileSize": file_size,
                "releaseNotes": self.release_notes,
                "isForce": self.is_force,
                "platform": self.platform,
                "checksum": checksum,
            })

            if data.get("success"):
                self._l("success", f"🎉 发布成功! 版本 v{self.version} 已生效")
                self.finished_ok.emit(True, self.version, file_url, "")
            else:
                msg = data.get("error") or data.get("message") or "发布失败"
                self._l("error", f"发布失败: {msg}")
                if "设备未授权" in msg or "device" in msg.lower() and "auth" in msg.lower():
                    self._l("info", "请在 Cloudflare D1 控制台执行授权 SQL（见下方）")
                self.finished_ok.emit(False, self.version, file_url, msg)

        except Exception as e:
            tb = traceback.format_exc()
            self._l("error", f"出错: {e}")
            self._l("debug", tb)
            self.finished_ok.emit(False, self.version, "", str(e))


# ========================================================================
# 授权对话框
# ========================================================================

class DeviceAuthDialog(QDialog):
    def __init__(self, device_id: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle("🔐 授权此 PC 设备")
        self.resize(720, 480)
        self.setWindowFlag(Qt.WindowStaysOnTopHint, True)  # 置顶显示
        self.setModal(True)
        self.device_id = device_id
        self._build()

    def _build(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(24, 24, 24, 24)
        lay.setSpacing(14)

        tip = QLabel("⚠️ 当前设备尚未加入服务器白名单")
        tip.setStyleSheet("font-size:16px;font-weight:bold;color:#dc2626;")
        lay.addWidget(tip)

        step_box = QFrame()
        step_box.setStyleSheet("background:#fef3c7;border:1px solid #f59e0b;border-radius:12px;")
        step_lay = QVBoxLayout(step_box)
        step_lay.setContentsMargins(16, 14, 16, 14)
        step_lay.setSpacing(6)
        header = QLabel("三步完成授权：")
        header.setStyleSheet("color:#92400e;font-weight:bold;font-size:13px;")
        step_lay.addWidget(header)
        for i, text in enumerate([
            "① 点下方「📋 复制 SQL」按钮",
            "② 打开 Cloudflare D1 控制台 → 选择你的数据库 → 点击 Console",
            "③ 粘贴 SQL 并按回车执行；返回此窗口点击「✅ 我已授权，继续」"
        ], 1):
            lbl = QLabel(text)
            lbl.setStyleSheet("color:#78350f;font-size:12px;")
            step_lay.addWidget(lbl)
        lay.addWidget(step_box)

        sql = (
            "INSERT INTO app_update_devices (id, deviceId, deviceName, grantedBy, grantedAt, isActive)\n"
            f"VALUES ('pc-{int(time.time())}', '{self.device_id}', 'PC-更新发布工具', 'manual', datetime('now'), 1);"
        )
        self.sql_text = sql

        sql_label = QLabel("SQL 语句（可点击文本框全选后复制）：")
        sql_label.setStyleSheet("color:#334155;font-weight:bold;font-size:12px;margin-top:4px;")
        lay.addWidget(sql_label)

        box = QTextEdit()
        box.setPlainText(sql)
        box.setReadOnly(True)
        box.setStyleSheet("background:#0f172a;color:#22d3ee;font-family:Consolas,Monospace;font-size:12px;border:1px solid #334155;border-radius:8px;")
        box.setFixedHeight(120)
        lay.addWidget(box)

        # 单独的设备ID显示，方便排查
        did_row = QHBoxLayout()
        did_lbl = QLabel(f"设备ID：<span style='font-family:Consolas;color:#334155;'>{self.device_id}</span>")
        did_lbl.setTextFormat(Qt.RichText)
        did_lbl.setStyleSheet("background:#f1f5f9;padding:8px 12px;border-radius:8px;font-size:11px;")
        did_lbl.setCursor(Qt.PointingHandCursor)
        did_lbl.mousePressEvent = lambda _: (QApplication.clipboard().setText(self.device_id),)
        did_row.addWidget(did_lbl, 1)
        lay.addLayout(did_row)

        btn_row = QHBoxLayout()
        btn_skip = QPushButton("稍后处理")
        btn_skip.setStyleSheet(
            "padding:10px 18px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-weight:bold;"
        )
        btn_skip.clicked.connect(self.reject)
        btn_row.addWidget(btn_skip)

        btn_copy = QPushButton("📋 复制 SQL")
        btn_copy.setStyleSheet(
            "padding:10px 18px;background:#3b82f6;color:#fff;border:none;border-radius:8px;"
            "font-weight:bold;font-size:13px;"
        )
        btn_copy.clicked.connect(self._copy_sql)
        btn_row.addWidget(btn_copy)

        btn_row.addStretch(1)
        btn_ok = QPushButton("✅ 我已授权，继续")
        btn_ok.setStyleSheet(
            "padding:10px 24px;background:#10b981;color:#fff;border:none;border-radius:8px;"
            "font-weight:bold;font-size:13px;"
        )
        btn_ok.clicked.connect(self.accept)
        btn_row.addWidget(btn_ok)
        lay.addLayout(btn_row)

        # 自动复制一次 + 提示
        QApplication.clipboard().setText(sql)
        hint = QLabel("💡 SQL 已自动复制到剪贴板。若剪贴板被覆盖，可随时点击「📋 复制 SQL」重新复制。")
        hint.setStyleSheet("color:#64748b;font-size:11px;")
        hint.setWordWrap(True)
        lay.addWidget(hint)

    def _copy_sql(self):
        QApplication.clipboard().setText(self.sql_text)
        QMessageBox.information(self, "已复制", "SQL 已复制到剪贴板\n请粘贴到 Cloudflare D1 Console 执行。")


# ========================================================================
# 主窗口
# ========================================================================

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(880, 680)
        self.setMinimumSize(780, 580)
        self.setAcceptDrops(True)

        self.apk_path = ""
        self.device_id = load_device_id()
        self.worker: Optional[PublishWorker] = None

        self._apply_style()
        self._build_ui()
        self._load_saved_settings()
        # 延迟 500ms 再检测授权，确保主窗口先正常显示，避免网络请求阻塞白屏
        QtCore.QTimer.singleShot(500, self._check_auth)

    # ---------------- UI ----------------
    def _apply_style(self):
        self.setStyleSheet("""
        QMainWindow, QWidget { background:#f8fafc; color:#1e293b; font-family:"Microsoft YaHei","PingFang SC",sans-serif; font-size:13px; }
        QGroupBox { border:1px solid #e2e8f0; border-radius:12px; margin-top:12px; background:#ffffff; }
        QGroupBox::title { subcontrol-origin: margin; left:16px; padding:0 8px; color:#334155; font-weight:bold; }
        QLineEdit, QComboBox, QTextEdit { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; background:#fff; selection-background-color:#3b82f6; }
        QLineEdit:focus, QComboBox:focus, QTextEdit:focus { border:1px solid #3b82f6; }
        QPushButton { border:none; border-radius:8px; padding:9px 18px; font-weight:bold; }
        QPushButton#primary { background:#3b82f6; color:#fff; }
        QPushButton#primary:hover { background:#2563eb; }
        QPushButton#primary:disabled { background:#93c5fd; }
        QPushButton#secondary { background:#e2e8f0; color:#0f172a; }
        QPushButton#secondary:hover { background:#cbd5e1; }
        QPushButton#danger { background:#ef4444; color:#fff; }
        QPushButton#danger:hover { background:#dc2626; }
        QCheckBox { padding:4px; }
        QProgressBar { border:1px solid #cbd5e1; border-radius:8px; background:#f1f5f9; text-align:center; height:22px; }
        QProgressBar::chunk { background-color: #10b981; border-radius:7px; }
        QTextEdit#log { background:#0f172a; color:#e2e8f0; font-family:Consolas,Monospace; font-size:12px; border:none; border-radius:10px; padding:10px; }
        """)

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        main = QVBoxLayout(central)
        main.setContentsMargins(20, 20, 20, 20)
        main.setSpacing(16)

        # 标题
        title_bar = QHBoxLayout()
        icon_lbl = QLabel("🚀")
        icon_lbl.setStyleSheet("font-size:32px;")
        title_bar.addWidget(icon_lbl)
        title_box = QVBoxLayout()
        title = QLabel("起飞塔 · 更新发布工具")
        title.setStyleSheet("font-size:22px;font-weight:bold;color:#0f172a;")
        subtitle = QLabel("拖放 APK 到下方 → 填写版本信息 → 一键发布，手机端即时更新")
        subtitle.setStyleSheet("color:#64748b;font-size:13px;")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        title_bar.addLayout(title_box)
        title_bar.addStretch(1)
        device_lbl = QLabel(f"设备ID: <span style='font-family:Consolas;'>{self.device_id[:12]}...{self.device_id[-6:]}</span>")
        device_lbl.setTextFormat(Qt.RichText)
        device_lbl.setStyleSheet("color:#64748b;font-size:11px;padding:6px 12px;background:#e2e8f0;border-radius:12px;")
        device_lbl.setCursor(Qt.PointingHandCursor)
        device_lbl.mousePressEvent = lambda e: (QApplication.clipboard().setText(self.device_id),
                                                 self._toast("设备ID 已复制"))
        title_bar.addWidget(device_lbl)
        main.addLayout(title_bar)

        # —— 首次使用提示：醒目「授权此设备」按钮（始终可见）——
        firstuse_bar = QFrame()
        firstuse_bar.setStyleSheet(
            "background:linear-gradient(90deg, #fef3c7, #fde68a);"
            "border:1px solid #f59e0b;border-radius:10px;padding:4px;"
        )
        ful = QHBoxLayout(firstuse_bar)
        ful.setContentsMargins(14, 10, 14, 10)
        ful.setSpacing(12)
        fu_icon = QLabel("🔐")
        fu_icon.setStyleSheet("font-size:22px;")
        ful.addWidget(fu_icon)
        fu_text_box = QVBoxLayout()
        fu_text_box.setSpacing(2)
        fu_title = QLabel("首次使用？授权此设备后才能发布新版本")
        fu_title.setStyleSheet("color:#92400e;font-weight:bold;font-size:13px;")
        fu_sub = QLabel("本机设备ID需先加入 Cloudflare D1 白名单，点右侧按钮获取 SQL → 复制 → 到 Cloudflare Console 执行")
        fu_sub.setStyleSheet("color:#78350f;font-size:11px;")
        fu_sub.setWordWrap(True)
        fu_text_box.addWidget(fu_title)
        fu_text_box.addWidget(fu_sub)
        ful.addLayout(fu_text_box, 1)
        self.auth_btn = QPushButton("🔐 打开授权对话框 / 验证权限")
        self.auth_btn.setStyleSheet(
            "padding:10px 18px;background:#d97706;color:#fff;border:none;"
            "border-radius:8px;font-weight:bold;font-size:13px;"
        )
        self.auth_btn.clicked.connect(self._open_auth_helper)
        ful.addWidget(self.auth_btn)
        main.addWidget(firstuse_bar)

        # ------ 拖放区 ------
        drop_group = QGroupBox("① 选择 / 拖放 APK")
        drop_lay = QVBoxLayout(drop_group)
        self.drop_zone = DropZone(self)
        drop_lay.addWidget(self.drop_zone)
        file_row = QHBoxLayout()
        self.file_label = QLineEdit()
        self.file_label.setReadOnly(True)
        self.file_label.setPlaceholderText("尚未选择文件")
        btn_browse = QPushButton("📂 浏览...")
        btn_browse.setObjectName("secondary")
        btn_browse.clicked.connect(self._browse_file)
        file_row.addWidget(self.file_label, 1)
        file_row.addWidget(btn_browse)
        drop_lay.addLayout(file_row)
        main.addWidget(drop_group)

        # ------ 版本信息 ------
        info_group = QGroupBox("② 版本信息")
        form = QFormLayout(info_group)
        form.setContentsMargins(16, 24, 16, 16)
        form.setSpacing(12)

        self.version_edit = QLineEdit()
        self.version_edit.setPlaceholderText("例如 1.2.3 / 2025.06.13")
        form.addRow("版本号 *", self.version_edit)

        self.platform_box = QComboBox()
        self.platform_box.addItems(["android (APK)", "ios (IPA)"])
        form.addRow("平台", self.platform_box)

        self.force_check = QCheckBox("强制更新（用户必须安装后才可继续使用）")
        form.addRow("更新类型", self.force_check)

        self.notes_edit = QTextEdit()
        self.notes_edit.setPlaceholderText(
            "1. 修复视频播放卡顿\n2. 新增 160P 低画质选项\n3. 优化深色模式主题"
        )
        self.notes_edit.setFixedHeight(100)
        form.addRow("更新日志", self.notes_edit)

        self.password_edit = QLineEdit()
        self.password_edit.setEchoMode(QLineEdit.Password)
        self.password_edit.setPlaceholderText("管理密码，默认 updateAdmin888")
        pw_row = QHBoxLayout()
        pw_row.addWidget(self.password_edit, 1)
        btn_test_auth = QPushButton("验证权限")
        btn_test_auth.setObjectName("secondary")
        btn_test_auth.clicked.connect(self._test_auth)
        pw_row.addWidget(btn_test_auth)
        form.addRow("管理密码 *", self._wrap_hbox(pw_row))

        main.addWidget(info_group)

        # ------ 发布按钮 ------
        action_row = QHBoxLayout()
        action_row.addStretch(1)
        self.btn_publish = QPushButton("🚀 一键发布新版本")
        self.btn_publish.setObjectName("primary")
        self.btn_publish.setMinimumHeight(42)
        self.btn_publish.setMinimumWidth(220)
        self.btn_publish.clicked.connect(self._start_publish)
        action_row.addWidget(self.btn_publish)

        self.btn_cancel = QPushButton("取消")
        self.btn_cancel.setObjectName("secondary")
        self.btn_cancel.clicked.connect(self._cancel_publish)
        self.btn_cancel.setVisible(False)
        action_row.addWidget(self.btn_cancel)
        action_row.addStretch(1)
        main.addLayout(action_row)

        # ------ 进度条 ------
        self.progress = QProgressBar()
        self.progress.setValue(0)
        self.progress.setFormat("等待发布...")
        main.addWidget(self.progress)

        # ------ 日志 ------
        log_group = QGroupBox("③ 运行日志")
        log_lay = QVBoxLayout(log_group)
        self.log_edit = QTextEdit()
        self.log_edit.setObjectName("log")
        self.log_edit.setReadOnly(True)
        self.log_edit.setStyleSheet(
            "background:#0f172a;color:#e2e8f0;font-family:Consolas,Monospace;"
            "font-size:12px;border:1px solid #1e293b;border-radius:10px;padding:10px;"
        )
        log_lay.addWidget(self.log_edit)
        main.addWidget(log_group, 1)

        # 底部提示
        hint = QLabel("💡 提示: 发布完成后，手机端 APP 启动即检测到新版本并提示更新")
        hint.setStyleSheet("color:#64748b;font-size:12px;")
        main.addWidget(hint)

    def _wrap_hbox(self, layout):
        w = QWidget()
        w.setLayout(layout)
        return w

    def _toast(self, msg: str):
        QMessageBox.information(self, "提示", msg)

    # ---------------- 拖放 ----------------
    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            for url in event.mimeData().urls():
                if url.toLocalFile().lower().endswith((".apk", ".ipa")):
                    event.acceptProposedAction()
                    return
        event.ignore()

    def dropEvent(self, event: QDropEvent):
        for url in event.mimeData().urls():
            f = url.toLocalFile()
            if f.lower().endswith((".apk", ".ipa")):
                self._set_file(f)
                break

    def _browse_file(self):
        f, _ = QFileDialog.getOpenFileName(self, "选择安装包", "",
                                           "安装包 (*.apk *.ipa);;所有文件 (*)")
        if f:
            self._set_file(f)

    def _set_file(self, path: str):
        self.apk_path = path
        self.file_label.setText(path)
        self.drop_zone.set_file(os.path.basename(path), os.path.getsize(path))

        # 尝试自动读取 APK 版本
        if path.lower().endswith(".apk") and not self.version_edit.text():
            self._append_log("info", f"正在读取 APK 信息: {os.path.basename(path)}")
            try:
                info = extract_apk_info(path)
                if info["ok"] and info["version"]:
                    self.version_edit.setText(info["version"])
                    self._append_log("success",
                                     f"检测到 APK 信息: 包名={info['package']}, version={info['version']}, "
                                     f"versionCode={info['version_code']}")
            except Exception as e:
                self._append_log("warn", f"读取 APK 信息失败: {e}（可手动填写）")

    # ---------------- 持久化 ----------------
    def _load_saved_settings(self):
        p = os.path.join(get_appdata_path(), "prefs.json")
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.password_edit.setText(data.get("password", ""))
                self.platform_box.setCurrentIndex(0 if data.get("platform") == "android" else 1)
                self.force_check.setChecked(bool(data.get("isForce")))
                self.notes_edit.setPlainText(data.get("releaseNotes", ""))
                if data.get("lastFile") and os.path.exists(data["lastFile"]):
                    self._set_file(data["lastFile"])
        except Exception:
            pass

    def _save_settings(self):
        data = {
            "password": self.password_edit.text(),
            "platform": self.platform_box.currentText().split()[0],
            "isForce": self.force_check.isChecked(),
            "releaseNotes": self.notes_edit.toPlainText(),
            "lastFile": self.apk_path,
        }
        try:
            with open(os.path.join(get_appdata_path(), "prefs.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    # ---------------- 鉴权 / 发布 ----------------
    _HTTP_HEADERS = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }

    def _check_auth(self):
        """启动时主动检测设备授权状态，未授权则立即弹出授权对话框"""
        try:
            prefs_path = os.path.join(get_appdata_path(), "prefs.json")
            saved_pw = ""
            if os.path.exists(prefs_path):
                try:
                    with open(prefs_path, "r", encoding="utf-8") as f:
                        saved_pw = json.load(f).get("password", "")
                except Exception:
                    pass
            test_pw = saved_pw or "updateAdmin888"
            r = requests.post(
                API_BASE + "/app-updates/admin-auth",
                json={"password": test_pw, "deviceId": self.device_id},
                headers=self._HTTP_HEADERS, timeout=15
            )
            data = r.json()
            if data.get("success"):
                self._append_log("success", "✅ 本机已在授权名单中，可以直接发布版本")
                if saved_pw:
                    self._append_log("info", "已自动使用已保存的管理密码")
                self._mark_authorized()
                return True
            else:
                msg = data.get("error", "本机尚未授权")
                self._append_log("warn", f"⚠️ {msg}")
                # 未授权 → 立即弹出授权对话框
                self._show_auth_dialog()
                return False
        except Exception as e:
            self._append_log("warn", f"⚠️ 无法连接服务器（{e}），请检查网络后点顶部「🔐 授权对话框」重试")
            return False

    def _open_auth_helper(self):
        """顶部醒目按钮的点击处理：先弹授权对话框，用户关对话框后再尝试一次联网验证"""
        self._show_auth_dialog()
        # 用户点"我已授权"之后 → 立即尝试一次验证
        try:
            pw = self.password_edit.text().strip() or "updateAdmin888"
            r = requests.post(API_BASE + "/app-updates/admin-auth",
                              json={"password": pw, "deviceId": self.device_id},
                              headers=self._HTTP_HEADERS, timeout=15)
            data = r.json()
            if data.get("success"):
                self._append_log("success", "✅ 设备授权成功！现在可以发布版本了")
                self._mark_authorized()
                QMessageBox.information(self, "授权成功", "✅ 本机已授权\n现在可以拖放 APK 并一键发布")
            else:
                self._append_log("warn", f"⚠️ 仍未通过验证：{data.get('error','未知')}")
        except Exception as e:
            self._append_log("warn", f"⚠️ 验证失败（{e}），请检查网络或 Cloudflare 控制台")

    def _mark_authorized(self):
        """顶部提示条更新为"已授权"状态"""
        try:
            self.auth_btn.setText("✅ 已授权（点击可重新验证）")
            self.auth_btn.setStyleSheet(
                "padding:10px 18px;background:#10b981;color:#fff;border:none;"
                "border-radius:8px;font-weight:bold;font-size:13px;"
            )
        except Exception:
            pass

    def _toast(self, msg: str):
        """简易提示"""
        try:
            QMessageBox.information(self, "提示", msg)
        except Exception:
            pass

    def _test_auth(self):
        pw = self.password_edit.text().strip()
        if not pw:
            QMessageBox.warning(self, "提示", "请输入管理密码")
            return
        try:
            r = requests.post(API_BASE + "/app-updates/admin-auth",
                              json={"password": pw, "deviceId": self.device_id},
                              headers={"Content-Type": "application/json"}, timeout=15)
            data = r.json()
            if data.get("success"):
                self._append_log("success", "✅ 鉴权成功，设备已授权")
                QMessageBox.information(self, "授权成功", "设备已授权，可以发布新版本")
            else:
                err = data.get("error") or "鉴权失败"
                self._append_log("error", f"❌ {err}")
                if "设备未授权" in err or "未授权" in err:
                    self._show_auth_dialog()
                else:
                    QMessageBox.warning(self, "失败", err)
        except Exception as e:
            self._append_log("error", f"网络请求失败: {e}")
            QMessageBox.critical(self, "错误", f"网络请求失败: {e}")

    def _show_auth_dialog(self):
        dlg = DeviceAuthDialog(self.device_id, self)
        dlg.exec_()

    def _start_publish(self):
        if self.worker and self.worker.isRunning():
            return
        if not self.apk_path or not os.path.exists(self.apk_path):
            QMessageBox.warning(self, "提示", "请先选择 APK/IPA 文件（拖放或浏览）")
            return
        version = self.version_edit.text().strip()
        if not version:
            QMessageBox.warning(self, "提示", "请填写版本号")
            return
        password = self.password_edit.text().strip()
        if not password:
            QMessageBox.warning(self, "提示", "请填写管理密码")
            return

        platform = self.platform_box.currentText().split()[0]
        release_notes = self.notes_edit.toPlainText().strip() or "新版本发布"
        is_force = self.force_check.isChecked()

        self._save_settings()
        self._append_log("info", "============ 开始发布 ============")
        self._append_log("info", f"文件: {self.apk_path}")

        self.progress.setValue(0)
        self.progress.setFormat("准备上传...")
        self.btn_publish.setEnabled(False)
        self.btn_cancel.setVisible(True)

        self.worker = PublishWorker(
            self.apk_path, password, self.device_id,
            version, release_notes, is_force, platform
        )
        self.worker.log.connect(self._on_log)
        self.worker.progress.connect(self._on_progress)
        self.worker.finished_ok.connect(self._on_finished)
        self.worker.start()

    def _cancel_publish(self):
        if self.worker and self.worker.isRunning():
            self.worker.cancel()
            self._append_log("warn", "已请求取消...")

    # ---------------- 信号处理 ----------------
    def _on_log(self, level: str, msg: str):
        color_map = {
            "info": "#e2e8f0",
            "success": "#4ade80",
            "warn": "#fbbf24",
            "error": "#f87171",
            "debug": "#94a3b8",
        }
        color = color_map.get(level, "#e2e8f0")
        timestamp = time.strftime("%H:%M:%S")
        self.log_edit.append(f'<span style="color:#64748b;">[{timestamp}]</span> <span style="color:{color};">{msg}</span>')
        sb = self.log_edit.verticalScrollBar()
        sb.setValue(sb.maximum())

    def _append_log(self, level: str, msg: str):
        self._on_log(level, msg)

    def _on_progress(self, done: int, total: int):
        if total <= 0:
            return
        pct = int(done * 100 / total)
        self.progress.setValue(pct)
        self.progress.setFormat(f"上传中 {pct}%  ({human_size(done)}/{human_size(total)})")

    def _on_finished(self, ok: bool, version: str, url: str, msg: str):
        self.btn_publish.setEnabled(True)
        self.btn_cancel.setVisible(False)
        if ok:
            self.progress.setValue(100)
            self.progress.setFormat("✅ 发布完成 100%")
            box = QMessageBox(self)
            box.setIcon(QMessageBox.Information)
            box.setWindowTitle("发布成功")
            box.setText(f"🎉 版本 v{version} 已成功发布\n\n手机端启动 APP 即会检测到新版本")
            copy_btn = box.addButton("📋 复制下载链接", QMessageBox.ActionRole)
            box.addButton("确定", QMessageBox.AcceptRole)
            box.exec_()
            if box.clickedButton() is copy_btn:
                QApplication.clipboard().setText(url)
        else:
            self.progress.setFormat("发布失败")
            err_msg = msg or "未知错误"
            if "设备未授权" in err_msg:
                self._show_auth_dialog()
            else:
                QMessageBox.critical(self, "发布失败", err_msg)


# ========================================================================
# 拖放区域组件
# ========================================================================

class DropZone(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAcceptDrops(True)
        self.setMinimumHeight(130)
        self.setStyleSheet("QFrame {border:2px dashed #cbd5e1;border-radius:12px;background:#ffffff;}"
                           "QFrame:hover {border-color:#3b82f6; background:#eff6ff;}")
        self._file_name = ""
        self._file_size = 0

        lay = QVBoxLayout(self)
        lay.setContentsMargins(20, 24, 20, 24)
        lay.setSpacing(8)

        icon = QLabel("📦")
        icon.setAlignment(Qt.AlignCenter)
        icon.setStyleSheet("font-size:36px;")
        lay.addWidget(icon)

        self.title = QLabel("将 APK/IPA 文件拖到这里")
        self.title.setAlignment(Qt.AlignCenter)
        self.title.setStyleSheet("font-size:15px;font-weight:bold;color:#334155;")
        lay.addWidget(self.title)

        self.subtitle = QLabel("（也可点击下方「浏览」按钮选择文件）")
        self.subtitle.setAlignment(Qt.AlignCenter)
        self.subtitle.setStyleSheet("color:#94a3b8;font-size:12px;")
        lay.addWidget(self.subtitle)

    def set_file(self, name: str, size: int):
        self._file_name = name
        self._file_size = size
        self.title.setText(f"✓ {name}")
        self.subtitle.setText(f"文件大小: {human_size(size)}")
        self.title.setStyleSheet("font-size:15px;font-weight:bold;color:#059669;")
        self.setStyleSheet("QFrame {border:2px solid #10b981;border-radius:12px;background:#ecfdf5;}")

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            for url in event.mimeData().urls():
                if url.toLocalFile().lower().endswith((".apk", ".ipa")):
                    event.acceptProposedAction()
                    self.setStyleSheet("QFrame {border:2px solid #3b82f6;border-radius:12px;background:#dbeafe;}")
                    return

    def dragLeaveEvent(self, event):
        if not self._file_name:
            self.setStyleSheet("QFrame {border:2px dashed #cbd5e1;border-radius:12px;background:#ffffff;}")

    def dropEvent(self, event: QDropEvent):
        if not self._file_name:
            self.setStyleSheet("QFrame {border:2px dashed #cbd5e1;border-radius:12px;background:#ffffff;}")


# ========================================================================
# 入口
# ========================================================================

def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setStyle("Fusion")

    win = MainWindow()
    win.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
