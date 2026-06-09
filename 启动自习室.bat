@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe

:: 检查服务是否在运行
%SystemRoot%\System32\curl.exe -s http://localhost:3001/api/health >nul 2>&1
if %errorlevel% equ 0 goto open

:: 启动服务（最小化窗口）
start "自习室" /min cmd /c "cd /d %~dp0server && node index.js"

:: 等待服务就绪（最多等 15 秒）
echo 正在启动服务...
for /L %%i in (1,1,15) do (
    timeout /t 1 /nobreak >nul
    %SystemRoot%\System32\curl.exe -s http://localhost:3001/api/health >nul 2>&1
    if !errorlevel! equ 0 goto open
)
echo 启动超时，请检查是否已安装 Node.js
pause
exit

:open
start "" "%CHROME%" --app=http://localhost:3001 --window-size=1280,800
