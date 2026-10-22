@echo off
cd /d "%~dp0"
if not exist node_modules call npm ci
if errorlevel 1 exit /b 1
if not exist data\torob.db call npm run import
if errorlevel 1 exit /b 1
call npm start
