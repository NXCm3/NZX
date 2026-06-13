@echo off
chcp 65001 >nul
REM ==========================================
REM 起飞塔更新发布工具 - 一键打包脚本
REM 产物: dist\起飞塔更新发布工具.exe
REM ==========================================

echo.
echo ========================================
echo   起飞塔更新发布工具 - 打包中...
echo ========================================
echo.

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败，请检查网络或手动执行 pip install
    pause
    exit /b 1
)

echo.
echo [1/2] 清理旧产物...
if exist build rd /s /q build
if exist dist rd /s /q dist
if exist 起飞塔更新发布工具.spec del /q 起飞塔更新发布工具.spec

echo.
echo [2/2] 开始打包 (PyInstaller)...
python -m PyInstaller ^
    --noconfirm ^
    --clean ^
    --onefile ^
    --windowed ^
    --name "起飞塔更新发布工具" ^
    --hidden-import PyQt5 ^
    --hidden-import requests ^
    main.py

if errorlevel 1 (
    echo.
    echo [错误] 打包失败，请检查上方错误信息
    pause
    exit /b 1
)

echo.
echo ========================================
echo   ✅ 打包完成
echo   产物: dist\起飞塔更新发布工具.exe
echo ========================================
echo.
pause
