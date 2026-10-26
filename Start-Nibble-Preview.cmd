@echo off
setlocal
cd /d "%~dp0"
echo Building the Nibble browser preview...
echo Keep this window open while reviewing in ChatGPT.
call npm.cmd run preview:staging
if errorlevel 1 (
  echo.
  echo The preview could not start. Read the error above.
  pause
)
endlocal
