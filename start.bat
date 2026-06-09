@echo off
chcp 65001 >nul
title 虚拟自习室
cd /d "%~dp0"

echo.
echo  ==========================================
echo     📚 虚拟自习室 — 启动中...
echo  ==========================================
echo.

:: 清理端口
netstat -ano | findstr ":3001" >nul
if %errorlevel% equ 0 (
    echo  ⚠️  关闭旧进程...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001"') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

:: 检查是否需要构建前端
if not exist "client\dist\index.html" (
    echo  🔨 首次启动，正在构建前端（仅此一次）...
    cd client
    call npm run build
    cd ..
    echo  ✅ 前端构建完成
) else (
    echo  ✅ 前端已就绪
)

:: 安装依赖（首次）
if not exist "server\node_modules" (
    echo  📦 安装服务端依赖...
    cd server
    call npm install
    cd ..
)

if not exist "client\node_modules" (
    echo  📦 安装客户端依赖...
    cd client
    call npm install
    cd ..
)

:: 启动服务
echo  🚀 启动服务...
start "虚拟自习室" /min cmd /c "cd /d server && node index.js"

:: 等待服务启动
echo  ⏳ 等待服务启动...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/api/health >nul 2>&1
if %errorlevel% neq 0 goto wait_loop

:: 打开浏览器
echo  🌐 打开浏览器...
start http://localhost:3001

echo.
echo  ==========================================
echo    ✅ 虚拟自习室 已启动！
echo    📍 http://localhost:3001
echo    💡 服务在后台运行，关闭此窗口不受影响
echo  ==========================================
echo.
timeout /t 3 /nobreak >nul
