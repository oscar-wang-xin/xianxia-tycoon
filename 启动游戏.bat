@echo off
chcp 65001 >nul
title 仙域大富翁 XIANXIA TYCOON
cd /d "%~dp0"

echo ============================================
echo   仙域大富翁 XIANXIA TYCOON - 本地启动
echo ============================================

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/2] 首次运行，正在安装依赖（约 1-2 分钟）...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo [2/2] 启动本地服务...
start "" http://localhost:5173
call npm run dev
pause
