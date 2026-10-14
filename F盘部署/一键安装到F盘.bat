@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-to-f-drive.ps1"
if errorlevel 1 pause
endlocal
